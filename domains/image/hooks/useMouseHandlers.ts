"use client";

import { useState, useCallback, useRef, RefObject } from "react";
import { EditorToolMode, CropArea, Point, DragType, Guide, AspectRatio } from "../types";
import { UnifiedLayer } from "@/shared/types/layers";
import { useEditorState, useEditorRefs } from "../contexts";
import { HANDLE_SIZE } from "../constants";
import { getRectHandleAtPosition } from "@/shared/utils/rectTransform";
import { safeSetPointerCapture } from "@/shared/utils";
import {
  buildContext,
  FloatingLayer,
  usePanZoomHandler,
  useGuideHandler,
  useBrushHandler,
  useEyedropperFillHandler,
  useSelectionHandler,
  useCropHandler,
  useMoveHandler,
} from "./handlers";

// ============================================
// Types
// ============================================

interface UseMouseHandlersOptions {
  // Layers
  layers: UnifiedLayer[];

  // Active layer position for coordinate offset (for brush drawing)
  activeLayerPosition?: { x: number; y: number } | null;

  // Tool state (temporary - getActiveToolMode checks isSpacePressed)
  getActiveToolMode: () => EditorToolMode;

  // Input functions (from useCanvasInput)
  getMousePos: (e: React.MouseEvent | React.PointerEvent) => Point;
  screenToImage: (x: number, y: number) => Point;

  // Display dimensions helper
  getDisplayDimensions: () => { width: number; height: number };

  // Brush functions (from useBrushTool)
  drawOnEditCanvas: (x: number, y: number, isStart?: boolean, pressure?: number) => void;
  pickColor: (x: number, y: number, canvasRef: RefObject<HTMLCanvasElement | null>, zoom: number, pan: Point) => void;
  resetLastDrawPoint: () => void;
  stampSource: { x: number; y: number } | null;
  setStampSource: (source: { x: number; y: number } | null) => void;

  // Selection functions (from useSelectionTool)
  selection: CropArea | null;
  selectionFeather: number;
  setSelection: (selection: CropArea | null) => void;
  isMovingSelection: boolean;
  setIsMovingSelection: (value: boolean) => void;
  isDuplicating: boolean;
  setIsDuplicating: (value: boolean) => void;
  floatingLayerRef: RefObject<FloatingLayer | null>;
  dragStartOriginRef: RefObject<Point | null>;

  // Crop functions (from useCropTool)
  cropArea: CropArea | null;
  setCropArea: (area: CropArea | null) => void;
  aspectRatio: AspectRatio;
  getAspectRatioValue: (ratio: AspectRatio) => number | null;
  canvasExpandMode: boolean;
  updateCropExpand: (x: number, y: number, startX: number, startY: number) => void;

  // History
  saveToHistory: () => void;

  // Fill function
  fillWithColor: () => void;

  // Transform functions (from useTransformTool)
  isTransformActive?: () => boolean;
  handleTransformMouseDown?: (imagePos: Point, modifiers: { shift: boolean; alt: boolean }) => string | null;
  handleTransformMouseMove?: (imagePos: Point, modifiers: { shift: boolean; alt: boolean }) => void;
  handleTransformMouseUp?: () => void;

  // Guide functions (from useGuideTool)
  guides?: Guide[];
  showGuides?: boolean;
  lockGuides?: boolean;
  moveGuide?: (id: string, newPosition: number) => void;
  removeGuide?: (id: string) => void;
  getGuideAtPosition?: (pos: Point, tolerance: number) => Guide | null;

  // Layer movement functions
  activeLayerId?: string | null;
  updateLayerPosition?: (layerId: string, position: { x: number; y: number }) => void;
  // Multi-layer support
  selectedLayerIds?: string[];
  updateMultipleLayerPositions?: (updates: Array<{ layerId: string; position: { x: number; y: number } }>) => void;
}

interface UseMouseHandlersReturn {
  // Drag state
  isDragging: boolean;
  dragType: DragType;
  resizeHandle: string | null;
  mousePos: Point | null;

  // Guide hover state (for cursor)
  hoveredGuide: Guide | null;

  // State setters (for external use if needed)
  setIsDragging: (value: boolean) => void;
  setDragType: (type: DragType) => void;
  setResizeHandle: (handle: string | null) => void;

  // Handlers
  handleMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
  handleMouseMove: (e: React.MouseEvent | React.PointerEvent) => void;
  handleMouseUp: (e?: React.MouseEvent | React.PointerEvent) => void;
  handleMouseLeave: (e?: React.MouseEvent | React.PointerEvent) => void;
}

// ============================================
// Hook Implementation (Coordinator)
// ============================================

export function useMouseHandlers(options: UseMouseHandlersOptions): UseMouseHandlersReturn {
  // Get state and setters from EditorStateContext
  const {
    state: { zoom, pan, rotation, canvasSize, isPanLocked },
    setZoom,
    setPan,
  } = useEditorState();

  // Get refs from EditorRefsContext
  const { canvasRef, editCanvasRef, imageRef } = useEditorRefs();

  // Destructure options
  const {
    layers,
    activeLayerPosition,
    getActiveToolMode,
    getDisplayDimensions,
    getMousePos,
    screenToImage,
    drawOnEditCanvas,
    pickColor,
    resetLastDrawPoint,
    stampSource,
    setStampSource,
    selection,
    selectionFeather,
    setSelection,
    isMovingSelection,
    setIsMovingSelection,
    isDuplicating,
    setIsDuplicating,
    floatingLayerRef,
    dragStartOriginRef,
    cropArea,
    setCropArea,
    aspectRatio,
    getAspectRatioValue,
    canvasExpandMode,
    updateCropExpand,
    saveToHistory,
    fillWithColor,
    isTransformActive,
    handleTransformMouseDown,
    handleTransformMouseMove,
    handleTransformMouseUp,
    guides,
    showGuides,
    lockGuides,
    moveGuide,
    removeGuide,
    getGuideAtPosition,
    activeLayerId,
    updateLayerPosition,
    selectedLayerIds,
    updateMultipleLayerPositions,
  } = options;

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const [dragType, setDragType] = useState<DragType>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const activeTouchPointerIdsRef = useRef<Set<number>>(new Set());

  // Base handler options
  const baseOptions = {
    canvasRef,
    editCanvasRef,
    imageRef,
    zoom,
    pan,
    rotation,
    canvasSize,
    setZoom,
    setPan,
    getDisplayDimensions,
  };

  // Initialize individual handlers
  const panZoomHandler = usePanZoomHandler(baseOptions);

  const guideHandler = useGuideHandler({
    ...baseOptions,
    guides,
    showGuides,
    lockGuides,
    moveGuide,
    removeGuide,
    getGuideAtPosition,
  });

  const brushHandler = useBrushHandler({
    ...baseOptions,
    activeLayerPosition,
    drawOnEditCanvas,
    pickColor,
    resetLastDrawPoint,
    stampSource,
    setStampSource,
    fillWithColor,
    saveToHistory,
  });

  const eyedropperFillHandler = useEyedropperFillHandler({
    ...baseOptions,
    pickColor,
    fillWithColor,
  });

  const selectionHandler = useSelectionHandler({
    ...baseOptions,
    activeLayerPosition,
    selection,
    selectionFeather,
    setSelection,
    isMovingSelection,
    setIsMovingSelection,
    isDuplicating,
    setIsDuplicating,
    floatingLayerRef,
    dragStartOriginRef,
    saveToHistory,
  });

  const cropHandler = useCropHandler({
    ...baseOptions,
    cropArea,
    setCropArea,
    aspectRatio,
    getAspectRatioValue,
    canvasExpandMode,
    updateCropExpand,
  });

  const moveHandler = useMoveHandler({
    ...baseOptions,
    selection,
    selectionFeather,
    setSelection,
    floatingLayerRef,
    dragStartOriginRef,
    setIsMovingSelection,
    setIsDuplicating,
    activeLayerId,
    activeLayerPosition,
    updateLayerPosition,
    updateMultipleLayerPositions,
    saveToHistory,
    // Multi-layer support
    selectedLayerIds,
    layers,
  });

  // Helper to check if position is in bounds
  const isInBounds = useCallback(
    (pos: Point): boolean => {
      const { width, height } = getDisplayDimensions();
      return pos.x >= 0 && pos.x <= width && pos.y >= 0 && pos.y <= height;
    },
    [getDisplayDimensions]
  );

  // Handle mouse/pointer down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent | React.PointerEvent) => {
      if (layers.length === 0) return;

      const inputDevice = getInputDevice(e);
      if ("pointerId" in e && inputDevice === "touch") {
        activeTouchPointerIdsRef.current.add(e.pointerId);
      }

      const isTouchPanOnlyInput = isPanLocked && inputDevice === "touch";
      if (isTouchPanOnlyInput && "isPrimary" in e && !e.isPrimary) {
        return;
      }

      // Capture pointer for touch/pen to receive move events during drag
      if ("pointerId" in e && e.target instanceof Element) {
        safeSetPointerCapture(e.target, e.pointerId);
      }

      const screenPos = getMousePos(e);
      const imagePos = screenToImage(screenPos.x, screenPos.y);
      const activeMode = isTouchPanOnlyInput ? "hand" : getActiveToolMode();
      const displayDimensions = getDisplayDimensions();
      const inBounds = isInBounds(imagePos);

      const ctx = buildContext(e, screenPos, imagePos, activeMode, inBounds, displayDimensions);

      // Touch pan lock: finger input should only pan/zoom (no guides/draw/move/crop)
      if (isTouchPanOnlyInput) {
        const panZoomResult = panZoomHandler.handleMouseDown(ctx);
        if (panZoomResult.handled) {
          setDragType(panZoomResult.dragType || null);
          if (panZoomResult.dragStart) dragStartRef.current = panZoomResult.dragStart;
          if (panZoomResult.dragType) setIsDragging(true);
        }
        return;
      }

      // Try handlers in order of priority
      // 1. Guide handler (highest priority when clicking on guide)
      const guideResult = guideHandler.handleMouseDown(ctx);
      if (guideResult.handled) {
        setDragType(guideResult.dragType || null);
        if (guideResult.dragStart) dragStartRef.current = guideResult.dragStart;
        setIsDragging(true);
        return;
      }

      // 2. Pan/Zoom handler
      const panZoomResult = panZoomHandler.handleMouseDown(ctx);
      if (panZoomResult.handled) {
        setDragType(panZoomResult.dragType || null);
        if (panZoomResult.dragStart) dragStartRef.current = panZoomResult.dragStart;
        if (panZoomResult.dragType) setIsDragging(true);
        return;
      }

      // 3. Eyedropper/Fill handler
      const eyedropperResult = eyedropperFillHandler.handleMouseDown(ctx);
      if (eyedropperResult.handled) return;

      // 4. Brush handler (brush, eraser, stamp)
      const brushResult = brushHandler.handleMouseDown(ctx);
      if (brushResult.handled) {
        setDragType(brushResult.dragType || null);
        setIsDragging(true);
        return;
      }

      // 5. Selection handler (marquee)
      const selectionResult = selectionHandler.handleMouseDown(ctx);
      if (selectionResult.handled) {
        setDragType(selectionResult.dragType || null);
        if (selectionResult.dragStart) dragStartRef.current = selectionResult.dragStart;
        setIsDragging(true);
        return;
      }

      // 6. Move handler
      const moveResult = moveHandler.handleMouseDown(ctx);
      if (moveResult.handled) {
        setDragType(moveResult.dragType || null);
        if (moveResult.dragStart) dragStartRef.current = moveResult.dragStart;
        setIsDragging(true);
        return;
      }

      // 7. Transform handler
      if (activeMode === "transform" && isTransformActive?.() && handleTransformMouseDown) {
        const handle = handleTransformMouseDown(imagePos, { shift: e.shiftKey, alt: e.altKey });
        if (handle) {
          setDragType("move");
          setIsDragging(true);
          return;
        }
      }

      // 8. Crop handler
      const cropResult = cropHandler.handleMouseDown(ctx);
      if (cropResult.handled) {
        setDragType(cropResult.dragType || null);
        setResizeHandle(cropResult.dragType === "resize" ? getResizeHandleName(imagePos, cropArea) : null);
        if (cropResult.dragStart) dragStartRef.current = cropResult.dragStart;
        setIsDragging(true);
        return;
      }
    },
    [
      layers.length,
      getMousePos,
      screenToImage,
      getActiveToolMode,
      isPanLocked,
      getDisplayDimensions,
      isInBounds,
      guideHandler,
      panZoomHandler,
      eyedropperFillHandler,
      brushHandler,
      selectionHandler,
      moveHandler,
      cropHandler,
      cropArea,
      isTransformActive,
      handleTransformMouseDown,
    ]
  );

  // Handle mouse/pointer move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent | React.PointerEvent) => {
      const inputDevice = getInputDevice(e);
      const isTouchPanOnlyInput = isPanLocked && inputDevice === "touch";
      if (isTouchPanOnlyInput && activeTouchPointerIdsRef.current.size > 1) {
        setMousePos(null);
        return;
      }

      const screenPos = getMousePos(e);
      const imagePos = screenToImage(screenPos.x, screenPos.y);
      const displayDimensions = getDisplayDimensions();
      const activeMode = isTouchPanOnlyInput ? "hand" : getActiveToolMode();
      const inBounds = isInBounds(imagePos);

      const ctx = buildContext(e, screenPos, imagePos, activeMode, inBounds, displayDimensions);

      // Update mouse position for brush preview
      if (inBounds) {
        setMousePos(imagePos);
      } else {
        setMousePos(null);
      }

      // Update guide hover state when not dragging
      if (!isDragging && !isTouchPanOnlyInput) {
        guideHandler.updateHoveredGuide(ctx);
      }

      if (!isDragging) return;

      // Dispatch move to appropriate handler based on dragType
      if (dragType === "guide") {
        guideHandler.handleMouseMove(ctx);
        return;
      }

      if (dragType === "pan") {
        panZoomHandler.handleMouseMove(ctx, dragStartRef.current);
        dragStartRef.current = screenPos; // Update for next frame
        return;
      }

      if (isTouchPanOnlyInput) return;

      if (dragType === "draw") {
        brushHandler.handleMouseMove(ctx);
        return;
      }

      // Handle transform tool
      if (activeMode === "transform" && isTransformActive?.() && handleTransformMouseMove) {
        handleTransformMouseMove(imagePos, { shift: e.shiftKey, alt: e.altKey });
        return;
      }

      // Handle selection create/move
      if (activeMode === "marquee") {
        if (dragType === "create") {
          selectionHandler.handleMouseMove(ctx, dragStartRef.current);
          return;
        }
        if (dragType === "move" && isMovingSelection) {
          moveHandler.handleMouseMove(ctx);
          // Update selection position to match floating layer
          if (floatingLayerRef.current && !isDuplicating) {
            setSelection({
              ...selection!,
              x: floatingLayerRef.current.x,
              y: floatingLayerRef.current.y,
            });
          }
          return;
        }
      }

      // Handle move tool
      if (activeMode === "move" && dragType === "move") {
        moveHandler.handleMouseMove(ctx);
        // Update selection position if we have a floating layer
        if (isMovingSelection && floatingLayerRef.current) {
          setSelection({
            ...selection!,
            x: floatingLayerRef.current.x,
            y: floatingLayerRef.current.y,
          });
        }
        return;
      }

      // Handle crop
      if (activeMode === "crop" && cropArea) {
        cropHandler.handleMouseMove(ctx, dragStartRef.current, dragType as string, resizeHandle);
        // Update dragStartRef for move operations
        if (dragType === "move") {
          dragStartRef.current = { x: Math.round(imagePos.x), y: Math.round(imagePos.y) };
        }
        return;
      }
    },
    [
      getMousePos,
      screenToImage,
      getDisplayDimensions,
      getActiveToolMode,
      isPanLocked,
      isInBounds,
      isDragging,
      dragType,
      resizeHandle,
      guideHandler,
      panZoomHandler,
      brushHandler,
      selectionHandler,
      moveHandler,
      cropHandler,
      isMovingSelection,
      isDuplicating,
      floatingLayerRef,
      selection,
      setSelection,
      cropArea,
      isTransformActive,
      handleTransformMouseMove,
    ]
  );

  // Handle mouse up
  const handleMouseUp = useCallback((e?: React.MouseEvent | React.PointerEvent) => {
    if (e && "pointerType" in e && e.pointerType === "touch" && "pointerId" in e) {
      activeTouchPointerIdsRef.current.delete(e.pointerId);
    } else if (!e) {
      activeTouchPointerIdsRef.current.clear();
    }

    // Handle transform tool mouse up
    if (handleTransformMouseUp) {
      handleTransformMouseUp();
    }

    // Handle guide drag end
    if (dragType === "guide") {
      guideHandler.handleMouseUp();
    }

    // Commit floating layer to edit canvas when done moving
    if (isMovingSelection && floatingLayerRef.current) {
      const editCanvas = editCanvasRef.current;
      const ctx = editCanvas?.getContext("2d");
      if (editCanvas && ctx) {
        const { imageData, x, y } = floatingLayerRef.current;
        const layerPosX = activeLayerPosition?.x || 0;
        const layerPosY = activeLayerPosition?.y || 0;
        const localX = x - layerPosX;
        const localY = y - layerPosY;

        // Create temp canvas to draw image data
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.putImageData(imageData, 0, 0);
          ctx.drawImage(tempCanvas, localX, localY);
        }

        // Update selection to floating layer's final position
        if (isDuplicating) {
          setSelection({
            x: x,
            y: y,
            width: imageData.width,
            height: imageData.height,
          });
        }
      }
      // Clear floating layer after commit
      (floatingLayerRef as { current: FloatingLayer | null }).current = null;
    }

    // Handle crop mouse up
    cropHandler.handleMouseUp();

    // Handle selection mouse up
    selectionHandler.handleMouseUp();

    // Handle move mouse up
    moveHandler.handleMouseUp();

    // Reset state
    setIsDragging(false);
    setDragType(null);
    setResizeHandle(null);
    setIsMovingSelection(false);
    setIsDuplicating(false);
    resetLastDrawPoint();
    (dragStartOriginRef as { current: Point | null }).current = null;
  }, [
    handleTransformMouseUp,
    dragType,
    guideHandler,
    isMovingSelection,
    isDuplicating,
    floatingLayerRef,
    editCanvasRef,
    setSelection,
    cropHandler,
    selectionHandler,
    moveHandler,
    setIsMovingSelection,
    setIsDuplicating,
    resetLastDrawPoint,
    dragStartOriginRef,
    activeLayerPosition,
  ]);

  // Handle mouse leave
  const handleMouseLeave = useCallback((e?: React.MouseEvent | React.PointerEvent) => {
    setMousePos(null);
    handleMouseUp(e);
  }, [handleMouseUp]);

  return {
    isDragging,
    dragType,
    resizeHandle,
    mousePos,
    hoveredGuide: guideHandler.hoveredGuide,
    setIsDragging,
    setDragType,
    setResizeHandle,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
  };
}

function getInputDevice(e: React.MouseEvent | React.PointerEvent): "mouse" | "touch" | "pen" {
  if ("pointerType" in e) {
    const pointerType = e.pointerType;
    if (pointerType === "touch" || pointerType === "pen") return pointerType;
  }
  return "mouse";
}

// Helper function to get resize handle name for crop
function getResizeHandleName(imagePos: Point, cropArea: CropArea | null): string | null {
  if (!cropArea) return null;
  const hit = getRectHandleAtPosition(imagePos, cropArea, {
    handleSize: HANDLE_SIZE.HIT_AREA,
    includeMove: false,
  });
  return hit === "move" ? null : hit;
}
