"use client";

import { useEffect, RefObject, useCallback, useRef } from "react";
import { UnifiedLayer, Point, CropArea, Guide, SnapSource } from "../types";
import { useEditorState, useEditorRefs } from "../contexts";
import { getCanvasColorsSync } from "@/shared/hooks";
import { calculateViewOffset, ViewContext } from "../utils/coordinateSystem";
import { canvasCache } from "../utils";
import { CHECKERBOARD, HANDLE_SIZE, ROTATE_HANDLE, FLIP_HANDLE, LAYER_CANVAS_UPDATED_EVENT } from "../constants";
import { drawBrushCursor } from "@/shared/utils/brushCursor";

// ============================================
// Types
// ============================================

interface FloatingLayer {
  imageData: ImageData;
  x: number;
  y: number;
  originX: number;
  originY: number;
}

interface TransformBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseCanvasRenderingOptions {
  // Refs from other hooks (not in context)
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  floatingLayerRef: RefObject<FloatingLayer | null>;

  // State from other hooks (not in context)
  layers: UnifiedLayer[];
  cropArea: CropArea | null;
  canvasExpandMode: boolean;
  mousePos: Point | null;
  brushSize: number;
  brushHardness: number;
  brushColor: string;
  stampSource: Point | null;
  activeLayerPosition?: Point | null;
  selection: { x: number; y: number; width: number; height: number } | null;
  isDuplicating: boolean;
  isMovingSelection: boolean;

  // Transform state (optional)
  transformBounds?: TransformBounds | null;
  isTransformActive?: boolean;
  transformLayerId?: string | null;
  transformOriginalImageData?: ImageData | null;
  transformRotation?: number;
  transformFlipX?: boolean;
  isSelectionBasedTransform?: boolean;

  // Guides (optional)
  guides?: Guide[];
  showGuides?: boolean;
  lockGuides?: boolean;
  activeSnapSources?: SnapSource[];
  // Guide drag preview (from ruler)
  guideDragPreview?: { orientation: "horizontal" | "vertical"; position: number } | null;

  // Functions
  getDisplayDimensions: () => { width: number; height: number };
}

interface UseCanvasRenderingReturn {
  // Manual render trigger if needed
  requestRender: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useCanvasRendering(
  options: UseCanvasRenderingOptions
): UseCanvasRenderingReturn {
  // Get state from EditorStateContext
  const {
    state: { zoom, pan, toolMode },
  } = useEditorState();

  // Get refs from EditorRefsContext
  const { canvasRef, containerRef, editCanvasRef } = useEditorRefs();

  // Props from other hooks (still required as options)
  const {
    layerCanvasesRef,
    floatingLayerRef,
    layers,
    cropArea,
    canvasExpandMode,
    mousePos,
    brushSize,
    brushHardness,
    brushColor,
    stampSource,
    activeLayerPosition,
    selection,
    isDuplicating,
    isMovingSelection,
    transformBounds,
    isTransformActive,
    transformLayerId,
    transformOriginalImageData,
    transformRotation = 0,
    transformFlipX = false,
    isSelectionBasedTransform,
    guides,
    showGuides,
    lockGuides,
    activeSnapSources,
    guideDragPreview,
    getDisplayDimensions,
  } = options;

  // Ref to store the render function for direct calls from ResizeObserver
  const renderFnRef = useRef<(() => void) | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Manual render trigger - calls render function directly via requestAnimationFrame
  const requestRender = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      renderFnRef.current?.();
      rafIdRef.current = null;
    });
  }, []);

  // Set up ResizeObserver - uses polling to wait for container to be available
  // because containerRef is set by a panel component that renders after this hook runs
  useEffect(() => {
    let checkInterval: NodeJS.Timeout | null = null;

    const setupObserver = () => {
      const container = containerRef.current;
      if (!container) return false;

      // Already set up
      if (resizeObserverRef.current) return true;

      resizeObserverRef.current = new ResizeObserver(() => {
        // Directly trigger render via requestAnimationFrame for immediate response
        requestRender();
      });

      resizeObserverRef.current.observe(container);
      return true;
    };

    // Try immediately
    if (!setupObserver()) {
      // Poll until container is available (panel may render later)
      checkInterval = setInterval(() => {
        if (setupObserver() && checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
      }, 100);
    }

    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [requestRender]);

  useEffect(() => {
    return () => {
      canvasCache.cleanup();
    };
  }, []);

  // Canvas render function - extracted so it can be called from ResizeObserver
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    const editCanvas = editCanvasRef.current;
    const container = containerRef.current;

    if (!canvas || !ctx || !container || layers.length === 0) return;

    // Get theme colors from CSS variables
    const colors = getCanvasColorsSync();

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    // Set canvas size to container size
    const containerRect = container.getBoundingClientRect();
    canvas.width = containerRect.width;
    canvas.height = containerRect.height;

    // Clear canvas with background color
    ctx.fillStyle =
      getComputedStyle(document.documentElement).getPropertyValue("--color-surface-tertiary") ||
      "#2a2a2a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate centered position with pan and zoom using coordinate utility
    const viewContext: ViewContext = {
      canvasSize: { width: canvas.width, height: canvas.height },
      displaySize: { width: displayWidth, height: displayHeight },
      zoom,
      pan,
    };
    const viewOffset = calculateViewOffset(viewContext);
    const offsetX = viewOffset.x;
    const offsetY = viewOffset.y;
    const scaledWidth = displayWidth * zoom;
    const scaledHeight = displayHeight * zoom;

    // Draw checkerboard pattern for transparency (like Photoshop)
    const checkerSize = CHECKERBOARD.SIZE_DEFAULT;
    const lightColor = colors.checkerboardLight;
    const darkColor = colors.checkerboardDark;

    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, scaledWidth, scaledHeight);
    ctx.clip();

    const startX = Math.floor(offsetX / checkerSize) * checkerSize;
    const startY = Math.floor(offsetY / checkerSize) * checkerSize;
    const endX = offsetX + scaledWidth;
    const endY = offsetY + scaledHeight;

    const checkerPattern = canvasCache.getCheckerboardPattern(
      ctx,
      checkerSize,
      lightColor,
      darkColor
    );
    if (checkerPattern) {
      ctx.fillStyle = checkerPattern;
      ctx.fillRect(startX, startY, endX - startX, endY - startY);
    }
    ctx.restore();

    // Draw all layers sorted by zIndex (lower first = background)
    // Unified layer system renders both image and paint layers in correct order
    const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of sortedLayers) {
      if (!layer.visible) continue;
      // Skip layer being transformed - it will be rendered in transform overlay
      if (isTransformActive && transformLayerId === layer.id && !isSelectionBasedTransform) continue;

      ctx.save();
      ctx.globalAlpha = layer.opacity / 100;

      // All layers are paint layers now - render from canvas
      const layerCanvas = layerCanvasesRef.current?.get(layer.id);
      if (layerCanvas) {
        ctx.imageSmoothingEnabled = false;
        ctx.translate(offsetX, offsetY);
        ctx.scale(zoom, zoom);
        // Use layer position for alignment/positioning
        const posX = layer.position?.x || 0;
        const posY = layer.position?.y || 0;
        ctx.drawImage(layerCanvas, posX, posY);
      }

      ctx.restore();
    }

    // Fallback: Draw legacy edit canvas if no layers but edit canvas exists
    if (layers.length === 0 && editCanvas) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(offsetX, offsetY);
      ctx.scale(zoom, zoom);
      ctx.drawImage(editCanvas, 0, 0);
      ctx.restore();
    }

    // Draw crop overlay
    if (cropArea && toolMode === "crop") {
      const cropX = offsetX + cropArea.x * zoom;
      const cropY = offsetY + cropArea.y * zoom;
      const cropW = cropArea.width * zoom;
      const cropH = cropArea.height * zoom;

      // In canvas expand mode, draw checkerboard pattern for extended areas
      if (canvasExpandMode) {
        const checkerSize = CHECKERBOARD.SIZE_EXPAND;
        const checkerPattern = canvasCache.getCheckerboardPattern(
          ctx,
          checkerSize,
          colors.checkerboardLight,
          colors.checkerboardDark
        );

        // Draw extended areas with checkerboard
        if (checkerPattern) {
          ctx.save();
          ctx.fillStyle = checkerPattern;

          // Left extension (if crop extends left of canvas)
          if (cropArea.x < 0) {
            const extW = Math.abs(cropArea.x) * zoom;
            ctx.fillRect(cropX, cropY, extW, cropH);
          }
          // Right extension (if crop extends right of canvas)
          if (cropArea.x + cropArea.width > displayWidth) {
            const extX = offsetX + displayWidth * zoom;
            const extW = (cropArea.x + cropArea.width - displayWidth) * zoom;
            ctx.fillRect(extX, cropY, extW, cropH);
          }
          // Top extension (if crop extends above canvas)
          if (cropArea.y < 0) {
            const extH = Math.abs(cropArea.y) * zoom;
            ctx.fillRect(cropX, cropY, cropW, extH);
          }
          // Bottom extension (if crop extends below canvas)
          if (cropArea.y + cropArea.height > displayHeight) {
            const extY = offsetY + displayHeight * zoom;
            const extH = (cropArea.y + cropArea.height - displayHeight) * zoom;
            ctx.fillRect(cropX, extY, cropW, extH);
          }
          ctx.restore();
        }
      }

      // Dark overlay outside crop area (only for areas within canvas)
      ctx.fillStyle = colors.overlay;
      // Calculate visible crop area (intersection with canvas)
      const visibleCropX = Math.max(0, cropArea.x);
      const visibleCropY = Math.max(0, cropArea.y);
      const visibleCropRight = Math.min(displayWidth, cropArea.x + cropArea.width);
      const visibleCropBottom = Math.min(displayHeight, cropArea.y + cropArea.height);

      // Top dark overlay
      if (visibleCropY > 0) {
        ctx.fillRect(offsetX, offsetY, scaledWidth, visibleCropY * zoom);
      }
      // Bottom dark overlay
      if (visibleCropBottom < displayHeight) {
        ctx.fillRect(
          offsetX,
          offsetY + visibleCropBottom * zoom,
          scaledWidth,
          (displayHeight - visibleCropBottom) * zoom,
        );
      }
      // Left dark overlay
      if (visibleCropX > 0) {
        ctx.fillRect(
          offsetX,
          offsetY + visibleCropY * zoom,
          visibleCropX * zoom,
          (visibleCropBottom - visibleCropY) * zoom
        );
      }
      // Right dark overlay
      if (visibleCropRight < displayWidth) {
        ctx.fillRect(
          offsetX + visibleCropRight * zoom,
          offsetY + visibleCropY * zoom,
          (displayWidth - visibleCropRight) * zoom,
          (visibleCropBottom - visibleCropY) * zoom
        );
      }

      // Draw crop border
      ctx.strokeStyle = colors.selection;
      ctx.lineWidth = 2;
      ctx.strokeRect(cropX, cropY, cropW, cropH);

      // Draw grid lines (rule of thirds)
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cropX + (cropW * i) / 3, cropY);
        ctx.lineTo(cropX + (cropW * i) / 3, cropY + cropH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cropX, cropY + (cropH * i) / 3);
        ctx.lineTo(cropX + cropW, cropY + (cropH * i) / 3);
        ctx.stroke();
      }

      // Draw resize handles
      const handleSize = HANDLE_SIZE.DEFAULT;
      ctx.fillStyle = colors.selection;
      const handles = [
        { x: cropX, y: cropY },
        { x: cropX + cropW / 2, y: cropY },
        { x: cropX + cropW, y: cropY },
        { x: cropX + cropW, y: cropY + cropH / 2 },
        { x: cropX + cropW, y: cropY + cropH },
        { x: cropX + cropW / 2, y: cropY + cropH },
        { x: cropX, y: cropY + cropH },
        { x: cropX, y: cropY + cropH / 2 },
      ];

      handles.forEach((h) => {
        ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
      });
    }

    // Draw guides
    if (showGuides && guides && guides.length > 0) {
      ctx.save();
      // Use locked color when guides are locked (darker, less prominent)
      ctx.strokeStyle = lockGuides ? colors.guideLocked : colors.guide;
      ctx.lineWidth = 1;

      for (const guide of guides) {
        ctx.beginPath();
        if (guide.orientation === "horizontal") {
          const screenY = offsetY + guide.position * zoom;
          ctx.moveTo(0, screenY);
          ctx.lineTo(canvas.width, screenY);
        } else {
          const screenX = offsetX + guide.position * zoom;
          ctx.moveTo(screenX, 0);
          ctx.lineTo(screenX, canvas.height);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw guide drag preview (from ruler drag)
    if (guideDragPreview) {
      ctx.save();
      ctx.strokeStyle = colors.guideActive;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();

      if (guideDragPreview.orientation === "horizontal") {
        const screenY = offsetY + guideDragPreview.position * zoom;
        ctx.moveTo(0, screenY);
        ctx.lineTo(canvas.width, screenY);
      } else {
        const screenX = offsetX + guideDragPreview.position * zoom;
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, canvas.height);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Draw active snap indicator lines
    if (activeSnapSources && activeSnapSources.length > 0) {
      ctx.save();
      ctx.strokeStyle = colors.guideActive;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      for (const source of activeSnapSources) {
        ctx.beginPath();
        if (source.orientation === "horizontal") {
          const screenY = offsetY + source.position * zoom;
          ctx.moveTo(0, screenY);
          ctx.lineTo(canvas.width, screenY);
        } else {
          const screenX = offsetX + source.position * zoom;
          ctx.moveTo(screenX, 0);
          ctx.lineTo(screenX, canvas.height);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw brush preview cursor
    if (mousePos && (toolMode === "brush" || toolMode === "eraser" || toolMode === "stamp")) {
      const screenX = offsetX + mousePos.x * zoom;
      const screenY = offsetY + mousePos.y * zoom;
      drawBrushCursor(ctx, {
        x: screenX,
        y: screenY,
        size: brushSize * zoom,
        hardness: brushHardness,
        color: toolMode === "eraser" ? colors.toolErase : brushColor,
        isEraser: toolMode === "eraser",
      });
    }

    // Draw stamp source indicator
    if (stampSource && toolMode === "stamp") {
      const layerPosX = activeLayerPosition?.x || 0;
      const layerPosY = activeLayerPosition?.y || 0;
      const sourceX = offsetX + (stampSource.x + layerPosX) * zoom;
      const sourceY = offsetY + (stampSource.y + layerPosY) * zoom;

      ctx.save();
      ctx.strokeStyle = colors.toolDraw;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sourceX - 10, sourceY);
      ctx.lineTo(sourceX + 10, sourceY);
      ctx.moveTo(sourceX, sourceY - 10);
      ctx.lineTo(sourceX, sourceY + 10);
      ctx.stroke();
      ctx.restore();
    }

    // Draw marquee selection (dotted line)
    // Show selection for tools that use it: marquee, move, fill, brush, eraser
    if (selection && (toolMode === "marquee" || toolMode === "move" || toolMode === "fill" || toolMode === "brush" || toolMode === "eraser" || floatingLayerRef.current)) {
      const selX = offsetX + selection.x * zoom;
      const selY = offsetY + selection.y * zoom;
      const selW = selection.width * zoom;
      const selH = selection.height * zoom;

      ctx.save();
      ctx.strokeStyle = colors.textOnColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(selX, selY, selW, selH);

      // Draw second layer with offset for "marching ants" effect
      ctx.strokeStyle = "#000000";
      ctx.lineDashOffset = 4;
      ctx.strokeRect(selX, selY, selW, selH);
      ctx.restore();
    }

    // Draw floating layer (when moving selection - both duplicate and cut-move)
    if (floatingLayerRef.current && isMovingSelection) {
      const floating = floatingLayerRef.current;
      const origW = floating.imageData.width * zoom;
      const origH = floating.imageData.height * zoom;

      // Draw original selection area indicator (where the copy/cut came from) - only for duplicate
      if (isDuplicating) {
        ctx.save();
        const origX = offsetX + floating.originX * zoom;
        const origY = offsetY + floating.originY * zoom;
        ctx.strokeStyle = colors.selection;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(origX, origY, origW, origH);
        ctx.restore();
      }

      // Draw the floating image being moved
      const { canvas: floatingCanvas, ctx: floatingCtx } = canvasCache.getTemporary(
        floating.imageData.width,
        floating.imageData.height,
        "floating-layer"
      );
      floatingCtx.putImageData(floating.imageData, 0, 0);

      ctx.save();
      ctx.globalAlpha = isDuplicating ? 0.8 : 1.0;
      const floatX = offsetX + floating.x * zoom;
      const floatY = offsetY + floating.y * zoom;
      ctx.drawImage(floatingCanvas, floatX, floatY, origW, origH);
      ctx.restore();

      // Draw selection border around floating layer
      ctx.save();
      ctx.strokeStyle = isDuplicating ? colors.stateDuplicate : colors.stateMove;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(floatX, floatY, origW, origH);
      ctx.restore();
    }

    // Draw eyedropper preview
    if (mousePos && toolMode === "eyedropper") {
      const screenX = offsetX + mousePos.x * zoom;
      const screenY = offsetY + mousePos.y * zoom;

      // Get color at position
      const pixel = ctx.getImageData(screenX, screenY, 1, 1).data;
      const previewColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;

      ctx.save();
      ctx.fillStyle = previewColor;
      ctx.strokeStyle = colors.textOnColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screenX, screenY - 30, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screenX, screenY - 30, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw transform overlay
    if (isTransformActive && transformBounds) {
      const bounds = transformBounds;
      const transformX = offsetX + bounds.x * zoom;
      const transformY = offsetY + bounds.y * zoom;
      const transformW = bounds.width * zoom;
      const transformH = bounds.height * zoom;
      const rotationRadians = (transformRotation * Math.PI) / 180;
      const centerX = transformX + transformW / 2;
      const centerY = transformY + transformH / 2;
      const rotateHandleOffset = ROTATE_HANDLE.OFFSET * zoom;
      const rotateHandleRadius = ROTATE_HANDLE.RADIUS;
      const flipHandleRadius = FLIP_HANDLE.RADIUS;
      const flipHandleX = -transformW / 2 + FLIP_HANDLE.EDGE_OFFSET;
      const rotateHandleY = -transformH / 2 - rotateHandleOffset;

      ctx.save();

      // Apply layer opacity to transform preview
      const transformLayer = transformLayerId ? layers.find(l => l.id === transformLayerId) : null;
      if (transformLayer) {
        ctx.globalAlpha = transformLayer.opacity / 100;
      }

      // Draw the transformed image from originalImageData
      if (transformOriginalImageData) {
        const { canvas: transformCanvas, ctx: transformCtx } = canvasCache.getTemporary(
          transformOriginalImageData.width,
          transformOriginalImageData.height,
          "transform-preview"
        );
        transformCtx.putImageData(transformOriginalImageData, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(rotationRadians);
        if (transformFlipX) {
          ctx.scale(-1, 1);
        }
        ctx.drawImage(
          transformCanvas,
          -transformW / 2,
          -transformH / 2,
          transformW,
          transformH
        );
        ctx.restore();
      }

      // Reset alpha for handles and border
      ctx.globalAlpha = 1;

      ctx.translate(centerX, centerY);
      ctx.rotate(rotationRadians);

      // Draw border
      ctx.strokeStyle = colors.selection;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(-transformW / 2, -transformH / 2, transformW, transformH);

      // Draw resize handles
      const handleSize = HANDLE_SIZE.DEFAULT;
      ctx.fillStyle = colors.selection;
      ctx.strokeStyle = colors.textOnColor;
      ctx.lineWidth = 1;

      const handles = [
        { x: -transformW / 2, y: -transformH / 2 }, // nw
        { x: 0, y: -transformH / 2 }, // n
        { x: transformW / 2, y: -transformH / 2 }, // ne
        { x: transformW / 2, y: 0 }, // e
        { x: transformW / 2, y: transformH / 2 }, // se
        { x: 0, y: transformH / 2 }, // s
        { x: -transformW / 2, y: transformH / 2 }, // sw
        { x: -transformW / 2, y: 0 }, // w
      ];

      handles.forEach((h) => {
        ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
      });

      // Draw flip handle circle (left-aligned on top row)
      const flipHandleActive = transformFlipX;
      ctx.fillStyle = flipHandleActive ? colors.textOnColor : colors.selection;
      ctx.strokeStyle = flipHandleActive ? colors.selection : colors.textOnColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(flipHandleX, rotateHandleY, flipHandleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw horizontal flip glyph inside the handle
      const flipGlyphStroke = flipHandleActive ? colors.selection : colors.textOnColor;
      const flipSpan = flipHandleRadius * 0.72;
      const flipArrow = flipHandleRadius * 0.34;
      const flipDivider = flipHandleRadius * 0.56;
      ctx.strokeStyle = flipGlyphStroke;
      ctx.lineWidth = 1.7;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(flipHandleX - flipSpan, rotateHandleY);
      ctx.lineTo(flipHandleX + flipSpan, rotateHandleY);
      ctx.moveTo(flipHandleX, rotateHandleY - flipDivider);
      ctx.lineTo(flipHandleX, rotateHandleY + flipDivider);
      ctx.moveTo(flipHandleX - flipSpan, rotateHandleY);
      ctx.lineTo(flipHandleX - flipSpan + flipArrow, rotateHandleY - flipArrow);
      ctx.moveTo(flipHandleX - flipSpan, rotateHandleY);
      ctx.lineTo(flipHandleX - flipSpan + flipArrow, rotateHandleY + flipArrow);
      ctx.moveTo(flipHandleX + flipSpan, rotateHandleY);
      ctx.lineTo(flipHandleX + flipSpan - flipArrow, rotateHandleY - flipArrow);
      ctx.moveTo(flipHandleX + flipSpan, rotateHandleY);
      ctx.lineTo(flipHandleX + flipSpan - flipArrow, rotateHandleY + flipArrow);
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";

      // Draw rotate handle stem (line from box top to handle)
      ctx.strokeStyle = colors.selection;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -transformH / 2);
      ctx.lineTo(0, rotateHandleY + rotateHandleRadius);
      ctx.stroke();

      // Draw rotate handle circle
      ctx.fillStyle = colors.selection;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, rotateHandleY, rotateHandleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.textOnColor;
      ctx.stroke();

      // Draw rotation arrow icon inside handle
      const iconR = rotateHandleRadius * 0.55;
      ctx.strokeStyle = colors.textOnColor;
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // Arc (~270 degree open circle)
      ctx.beginPath();
      ctx.arc(0, rotateHandleY, iconR, -Math.PI * 0.65, Math.PI * 0.85);
      ctx.stroke();
      // Arrowhead at the end of the arc
      const arrowTipX = iconR * Math.cos(-Math.PI * 0.65);
      const arrowTipY = rotateHandleY + iconR * Math.sin(-Math.PI * 0.65);
      const arrowSize = rotateHandleRadius * 0.4;
      ctx.beginPath();
      ctx.moveTo(arrowTipX - arrowSize * 0.3, arrowTipY - arrowSize);
      ctx.lineTo(arrowTipX, arrowTipY);
      ctx.lineTo(arrowTipX + arrowSize, arrowTipY - arrowSize * 0.3);
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";

      ctx.restore();
    }

    window.dispatchEvent(new Event(LAYER_CANVAS_UPDATED_EVENT));
  }, [
    canvasRef,
    containerRef,
    layerCanvasesRef,
    editCanvasRef,
    floatingLayerRef,
    layers,
    cropArea,
    canvasExpandMode,
    zoom,
    pan,
    getDisplayDimensions,
    toolMode,
    mousePos,
    brushSize,
    brushHardness,
    brushColor,
    stampSource,
    activeLayerPosition,
    selection,
    isDuplicating,
    isMovingSelection,
    transformBounds,
    isTransformActive,
    transformLayerId,
    transformOriginalImageData,
    transformRotation,
    transformFlipX,
    isSelectionBasedTransform,
    // Guide-related dependencies
    guides,
    showGuides,
    lockGuides,
    activeSnapSources,
    guideDragPreview,
  ]);

  // Store render function in ref for ResizeObserver to call
  useEffect(() => {
    renderFnRef.current = render;
  }, [render]);

  // Call render when dependencies change
  useEffect(() => {
    render();
  }, [render]);

  return {
    requestRender,
  };
}
