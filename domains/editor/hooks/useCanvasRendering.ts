"use client";

import { useEffect, RefObject, useCallback, useRef } from "react";
import { UnifiedLayer, Point, CropArea } from "../types";
import { useEditorState, useEditorRefs } from "../contexts";

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

interface UseCanvasRenderingOptions {
  // Refs from other hooks (not in context)
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  floatingLayerRef: RefObject<FloatingLayer | null>;

  // State from other hooks (not in context)
  layers: UnifiedLayer[];
  cropArea: CropArea | null;
  mousePos: Point | null;
  brushSize: number;
  brushColor: string;
  stampSource: Point | null;
  selection: { x: number; y: number; width: number; height: number } | null;
  isDuplicating: boolean;
  isMovingSelection: boolean;
  activeLayerId: string | null;

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
    state: { zoom, pan, rotation, canvasSize, toolMode },
  } = useEditorState();

  // Get refs from EditorRefsContext
  const { canvasRef, containerRef, editCanvasRef } = useEditorRefs();

  // Props from other hooks (still required as options)
  const {
    layerCanvasesRef,
    floatingLayerRef,
    layers,
    cropArea,
    mousePos,
    brushSize,
    brushColor,
    stampSource,
    selection,
    isDuplicating,
    isMovingSelection,
    activeLayerId,
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

  // Canvas render function - extracted so it can be called from ResizeObserver
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    const editCanvas = editCanvasRef.current;
    const container = containerRef.current;

    if (!canvas || !ctx || !container || layers.length === 0) return;

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

    // Calculate centered position with pan and zoom
    const scaledWidth = displayWidth * zoom;
    const scaledHeight = displayHeight * zoom;
    const offsetX = (canvas.width - scaledWidth) / 2 + pan.x;
    const offsetY = (canvas.height - scaledHeight) / 2 + pan.y;

    // Draw checkerboard pattern for transparency (like Photoshop)
    const checkerSize = 8;
    const lightColor = "#ffffff";
    const darkColor = "#cccccc";

    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, scaledWidth, scaledHeight);
    ctx.clip();

    const startX = Math.floor(offsetX / checkerSize) * checkerSize;
    const startY = Math.floor(offsetY / checkerSize) * checkerSize;
    const endX = offsetX + scaledWidth;
    const endY = offsetY + scaledHeight;

    for (let y = startY; y < endY; y += checkerSize) {
      for (let x = startX; x < endX; x += checkerSize) {
        const isLight =
          (Math.floor((x - startX) / checkerSize) + Math.floor((y - startY) / checkerSize)) % 2 ===
          0;
        ctx.fillStyle = isLight ? lightColor : darkColor;
        ctx.fillRect(x, y, checkerSize, checkerSize);
      }
    }
    ctx.restore();

    // Draw all layers sorted by zIndex (lower first = background)
    // Unified layer system renders both image and paint layers in correct order
    const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of sortedLayers) {
      if (!layer.visible) continue;

      ctx.save();
      ctx.globalAlpha = layer.opacity / 100;

      // All layers are paint layers now - render from canvas
      const layerCanvas = layerCanvasesRef.current?.get(layer.id);
      if (layerCanvas) {
        ctx.imageSmoothingEnabled = false;
        ctx.translate(offsetX, offsetY);
        ctx.scale(zoom, zoom);
        ctx.drawImage(layerCanvas, 0, 0);
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

      // Dark overlay outside crop area
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(offsetX, offsetY, scaledWidth, cropArea.y * zoom);
      ctx.fillRect(
        offsetX,
        cropY + cropH,
        scaledWidth,
        scaledHeight - (cropArea.y + cropArea.height) * zoom,
      );
      ctx.fillRect(offsetX, cropY, cropArea.x * zoom, cropH);
      ctx.fillRect(cropX + cropW, cropY, scaledWidth - (cropArea.x + cropArea.width) * zoom, cropH);

      // Draw crop border
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.strokeRect(cropX, cropY, cropW, cropH);

      // Draw grid lines (rule of thirds)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
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
      const handleSize = 8;
      ctx.fillStyle = "#3b82f6";
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

    // Draw brush preview cursor
    if (mousePos && (toolMode === "brush" || toolMode === "eraser" || toolMode === "stamp")) {
      const screenX = offsetX + mousePos.x * zoom;
      const screenY = offsetY + mousePos.y * zoom;
      const brushRadius = (brushSize * zoom) / 2;

      ctx.save();
      ctx.strokeStyle = toolMode === "eraser" ? "#ff4444" : brushColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(screenX, screenY, brushRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw crosshair
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(screenX - 5, screenY);
      ctx.lineTo(screenX + 5, screenY);
      ctx.moveTo(screenX, screenY - 5);
      ctx.lineTo(screenX, screenY + 5);
      ctx.stroke();
      ctx.restore();
    }

    // Draw stamp source indicator
    if (stampSource && toolMode === "stamp") {
      const sourceX = offsetX + stampSource.x * zoom;
      const sourceY = offsetY + stampSource.y * zoom;

      ctx.save();
      ctx.strokeStyle = "#00ff00";
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
      ctx.strokeStyle = "#ffffff";
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
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(origX, origY, origW, origH);
        ctx.restore();
      }

      // Draw the floating image being moved
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = floating.imageData.width;
      tempCanvas.height = floating.imageData.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.putImageData(floating.imageData, 0, 0);

        ctx.save();
        ctx.globalAlpha = isDuplicating ? 0.8 : 1.0;
        const floatX = offsetX + floating.x * zoom;
        const floatY = offsetY + floating.y * zoom;
        ctx.drawImage(tempCanvas, floatX, floatY, origW, origH);
        ctx.restore();

        // Draw selection border around floating layer
        ctx.save();
        ctx.strokeStyle = isDuplicating ? "#22c55e" : "#f59e0b";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(floatX, floatY, origW, origH);
        ctx.restore();
      }
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
      ctx.strokeStyle = "#ffffff";
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
  }, [
    canvasRef,
    containerRef,
    layerCanvasesRef,
    editCanvasRef,
    floatingLayerRef,
    layers,
    canvasSize,
    rotation,
    cropArea,
    zoom,
    pan,
    getDisplayDimensions,
    toolMode,
    mousePos,
    brushSize,
    brushColor,
    stampSource,
    selection,
    isDuplicating,
    isMovingSelection,
    activeLayerId,
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
