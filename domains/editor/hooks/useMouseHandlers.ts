"use client";

import { useState, useCallback, useRef, RefObject } from "react";
import { EditorToolMode, CropArea, Point, DragType } from "../types";
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

interface UseMouseHandlersOptions {
  // Layers
  layers: unknown[];

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
  aspectRatio: string;
  getAspectRatioValue: (ratio: any) => number | null;
  canvasExpandMode: boolean;
  updateCropExpand: (x: number, y: number, startX: number, startY: number) => void;

  // History
  saveToHistory: () => void;

  // Fill function
  fillWithColor: () => void;
}

interface UseMouseHandlersReturn {
  // Drag state
  isDragging: boolean;
  dragType: DragType;
  resizeHandle: string | null;
  mousePos: Point | null;

  // State setters (for external use if needed)
  setIsDragging: (value: boolean) => void;
  setDragType: (type: DragType) => void;
  setResizeHandle: (handle: string | null) => void;

  // Handlers
  handleMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
  handleMouseMove: (e: React.MouseEvent | React.PointerEvent) => void;
  handleMouseUp: () => void;
  handleMouseLeave: () => void;
}

// ============================================
// Helper Functions
// ============================================

const isInHandle = (pos: Point, handle: { x: number; y: number }, size: number = 8): boolean => {
  return Math.abs(pos.x - handle.x) <= size && Math.abs(pos.y - handle.y) <= size;
};

// ============================================
// Hook Implementation
// ============================================

export function useMouseHandlers(options: UseMouseHandlersOptions): UseMouseHandlersReturn {
  // Get state and setters from EditorStateContext
  const {
    state: { zoom, pan, rotation, canvasSize },
    setZoom,
    setPan,
  } = useEditorState();

  // Get refs from EditorRefsContext
  const { canvasRef, editCanvasRef, imageRef } = useEditorRefs();

  // Props from other hooks (still required as options)
  const {
    layers,
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
  } = options;

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 }); // Use ref for synchronous updates during fast drag
  const [dragType, setDragType] = useState<DragType>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);

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

      // Capture pointer for touch/pen to receive move events during drag
      if ('pointerId' in e && e.target instanceof Element) {
        e.target.setPointerCapture(e.pointerId);
      }

      const screenPos = getMousePos(e);
      const imagePos = screenToImage(screenPos.x, screenPos.y);
      const activeMode = getActiveToolMode();
      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
      const inBounds = isInBounds(imagePos);

      // Hand tool (pan)
      if (activeMode === "hand") {
        setDragType("pan");
        dragStartRef.current = screenPos;
        setIsDragging(true);
        return;
      }

      // Zoom tool
      if (activeMode === "zoom") {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const zoomFactor = e.altKey ? 0.8 : 1.25;
        const newZoom = Math.max(0.1, Math.min(10, zoom * zoomFactor));
        const scale = newZoom / zoom;

        // Zoom centered on cursor position
        // screenPos is relative to canvas top-left, but pan is relative to canvas center
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        setPan((p) => ({
          x: p.x * scale + (1 - scale) * (screenPos.x - centerX),
          y: p.y * scale + (1 - scale) * (screenPos.y - centerY),
        }));
        setZoom(newZoom);
        return;
      }

      // Eyedropper tool
      if (activeMode === "eyedropper" && inBounds) {
        pickColor(imagePos.x, imagePos.y, canvasRef, zoom, pan);
        return;
      }

      // Stamp tool
      if (activeMode === "stamp") {
        if (e.altKey && inBounds) {
          setStampSource({ x: imagePos.x, y: imagePos.y });
          return;
        }

        if (!stampSource) {
          alert("Alt+클릭으로 복제 소스를 먼저 지정하세요");
          return;
        }

        if (inBounds) {
          saveToHistory();
          setDragType("draw");
          resetLastDrawPoint();
          const pressure = "pressure" in e ? (e.pressure as number) || 1 : 1;
          drawOnEditCanvas(imagePos.x, imagePos.y, true, pressure);
          setIsDragging(true);
        }
        return;
      }

      // Brush/Eraser tool
      if ((activeMode === "brush" || activeMode === "eraser") && inBounds) {
        saveToHistory();
        setDragType("draw");
        resetLastDrawPoint();
        // Extract pressure from pointer event (React.PointerEvent has pressure property)
        const pressure = "pressure" in e ? (e.pressure as number) || 1 : 1;
        drawOnEditCanvas(imagePos.x, imagePos.y, true, pressure);
        setIsDragging(true);
        return;
      }

      // Fill tool
      if (activeMode === "fill" && inBounds) {
        fillWithColor();
        return;
      }

      // Marquee tool
      if (activeMode === "marquee") {
        if (selection) {
          // Check if clicking inside selection
          if (
            imagePos.x >= selection.x &&
            imagePos.x <= selection.x + selection.width &&
            imagePos.y >= selection.y &&
            imagePos.y <= selection.y + selection.height
          ) {
            // Alt+click to duplicate and move
            if (e.altKey) {
              const editCanvas = editCanvasRef.current;
              const ctx = editCanvas?.getContext("2d");
              const img = imageRef.current;
              if (!editCanvas || !ctx || !img) return;

              // Create composite canvas to get the selected area
              const compositeCanvas = document.createElement("canvas");
              compositeCanvas.width = displayWidth;
              compositeCanvas.height = displayHeight;
              const compositeCtx = compositeCanvas.getContext("2d");
              if (!compositeCtx) return;

              compositeCtx.translate(displayWidth / 2, displayHeight / 2);
              compositeCtx.rotate((rotation * Math.PI) / 180);
              compositeCtx.drawImage(img, -canvasSize.width / 2, -canvasSize.height / 2);
              compositeCtx.setTransform(1, 0, 0, 1, 0, 0);
              compositeCtx.drawImage(editCanvas, 0, 0);

              // Copy selection to floating layer
              const imageData = compositeCtx.getImageData(
                Math.round(selection.x),
                Math.round(selection.y),
                Math.round(selection.width),
                Math.round(selection.height)
              );
              (floatingLayerRef as { current: FloatingLayer | null }).current = {
                imageData,
                x: selection.x,
                y: selection.y,
                originX: selection.x,
                originY: selection.y,
              };

              saveToHistory();
              setIsMovingSelection(true);
              setIsDuplicating(true);
              setDragType("move");
              dragStartRef.current = imagePos;
              (dragStartOriginRef as { current: Point | null }).current = { x: imagePos.x, y: imagePos.y };
              setIsDragging(true);
              return;
            }

            // Regular click inside selection - move existing floating layer
            if (floatingLayerRef.current) {
              setDragType("move");
              dragStartRef.current = imagePos;
              (dragStartOriginRef as { current: Point | null }).current = { x: imagePos.x, y: imagePos.y };
              setIsDragging(true);
              setIsMovingSelection(true);
              setIsDuplicating(false);
              return;
            }
          }
        }

        // Click outside selection or no selection - create new selection
        if (inBounds) {
          setSelection(null);
          (floatingLayerRef as { current: FloatingLayer | null }).current = null;
          setIsDuplicating(false);
          setDragType("create");
          dragStartRef.current = { x: Math.round(imagePos.x), y: Math.round(imagePos.y) };
          setSelection({ x: Math.round(imagePos.x), y: Math.round(imagePos.y), width: 0, height: 0 });
          setIsDragging(true);
        }
        return;
      }

      // Move tool - only moves existing selections
      if (activeMode === "move") {
        if (selection) {
          if (
            imagePos.x >= selection.x &&
            imagePos.x <= selection.x + selection.width &&
            imagePos.y >= selection.y &&
            imagePos.y <= selection.y + selection.height
          ) {
            // If we don't have a floating layer yet, create one (cut operation)
            if (!floatingLayerRef.current) {
              const editCanvas = editCanvasRef.current;
              const ctx = editCanvas?.getContext("2d");
              const img = imageRef.current;
              if (!editCanvas || !ctx || !img) return;

              // Create composite canvas to get the selected area
              const compositeCanvas = document.createElement("canvas");
              compositeCanvas.width = displayWidth;
              compositeCanvas.height = displayHeight;
              const compositeCtx = compositeCanvas.getContext("2d");
              if (!compositeCtx) return;

              compositeCtx.translate(displayWidth / 2, displayHeight / 2);
              compositeCtx.rotate((rotation * Math.PI) / 180);
              compositeCtx.drawImage(img, -canvasSize.width / 2, -canvasSize.height / 2);
              compositeCtx.setTransform(1, 0, 0, 1, 0, 0);
              compositeCtx.drawImage(editCanvas, 0, 0);

              // Copy selection to floating layer
              const imageData = compositeCtx.getImageData(
                Math.round(selection.x),
                Math.round(selection.y),
                Math.round(selection.width),
                Math.round(selection.height)
              );
              (floatingLayerRef as { current: FloatingLayer | null }).current = {
                imageData,
                x: selection.x,
                y: selection.y,
                originX: selection.x,
                originY: selection.y,
              };

              saveToHistory();

              // Clear the original selection area (cut operation)
              ctx.clearRect(
                Math.round(selection.x),
                Math.round(selection.y),
                Math.round(selection.width),
                Math.round(selection.height)
              );
            }

            setDragType("move");
            dragStartRef.current = imagePos;
            (dragStartOriginRef as { current: Point | null }).current = { x: imagePos.x, y: imagePos.y };
            setIsDragging(true);
            setIsMovingSelection(true);
            setIsDuplicating(false);
            return;
          }
        }
        return;
      }

      // Crop tool
      if (activeMode === "crop") {
        if (cropArea) {
          const handles = [
            { x: cropArea.x, y: cropArea.y, name: "nw" },
            { x: cropArea.x + cropArea.width / 2, y: cropArea.y, name: "n" },
            { x: cropArea.x + cropArea.width, y: cropArea.y, name: "ne" },
            { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height / 2, name: "e" },
            { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height, name: "se" },
            { x: cropArea.x + cropArea.width / 2, y: cropArea.y + cropArea.height, name: "s" },
            { x: cropArea.x, y: cropArea.y + cropArea.height, name: "sw" },
            { x: cropArea.x, y: cropArea.y + cropArea.height / 2, name: "w" },
          ];

          for (const handle of handles) {
            if (isInHandle(imagePos, handle)) {
              setDragType("resize");
              setResizeHandle(handle.name);
              dragStartRef.current = imagePos;
              setIsDragging(true);
              return;
            }
          }

          if (
            imagePos.x >= cropArea.x &&
            imagePos.x <= cropArea.x + cropArea.width &&
            imagePos.y >= cropArea.y &&
            imagePos.y <= cropArea.y + cropArea.height
          ) {
            setDragType("move");
            dragStartRef.current = imagePos;
            setIsDragging(true);
            return;
          }
        }

        // In canvas expand mode, allow creating crop outside bounds
        if (inBounds || canvasExpandMode) {
          setDragType("create");
          dragStartRef.current = { x: Math.round(imagePos.x), y: Math.round(imagePos.y) };
          setCropArea({ x: Math.round(imagePos.x), y: Math.round(imagePos.y), width: 0, height: 0 });
          setIsDragging(true);
        }
      }
    },
    [
      layers.length,
      getMousePos,
      screenToImage,
      getActiveToolMode,
      getDisplayDimensions,
      isInBounds,
      zoom,
      setZoom,
      setPan,
      canvasRef,
      editCanvasRef,
      imageRef,
      rotation,
      canvasSize,
      pickColor,
      pan,
      stampSource,
      setStampSource,
      saveToHistory,
      resetLastDrawPoint,
      drawOnEditCanvas,
      fillWithColor,
      selection,
      setSelection,
      floatingLayerRef,
      dragStartOriginRef,
      setIsMovingSelection,
      setIsDuplicating,
      cropArea,
      setCropArea,
      canvasExpandMode,
    ]
  );

  // Handle mouse/pointer move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent | React.PointerEvent) => {
      const screenPos = getMousePos(e);
      const imagePos = screenToImage(screenPos.x, screenPos.y);
      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

      // Update mouse position for brush preview
      if (isInBounds(imagePos)) {
        setMousePos(imagePos);
      } else {
        setMousePos(null);
      }

      if (!isDragging) return;

      const ratioValue = getAspectRatioValue(aspectRatio);

      // Pan
      if (dragType === "pan") {
        const dx = screenPos.x - dragStartRef.current.x;
        const dy = screenPos.y - dragStartRef.current.y;
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        dragStartRef.current = screenPos;
        return;
      }

      // Draw
      if (dragType === "draw") {
        const clampedX = Math.max(0, Math.min(imagePos.x, displayWidth));
        const clampedY = Math.max(0, Math.min(imagePos.y, displayHeight));
        // Extract pressure from pointer event
        const pressure = "pressure" in e ? (e.pressure as number) || 1 : 1;
        drawOnEditCanvas(clampedX, clampedY, false, pressure);
        return;
      }

      // Handle marquee selection and move tool
      const activeMode = getActiveToolMode();
      if (activeMode === "marquee" || activeMode === "move") {
        if (dragType === "create" && selection && activeMode === "marquee") {
          let width = Math.round(imagePos.x) - dragStartRef.current.x;
          let height = Math.round(imagePos.y) - dragStartRef.current.y;

          const newX = width < 0 ? dragStartRef.current.x + width : dragStartRef.current.x;
          const newY = height < 0 ? dragStartRef.current.y + height : dragStartRef.current.y;

          setSelection({
            x: Math.max(0, newX),
            y: Math.max(0, newY),
            width: Math.min(Math.abs(width), displayWidth - Math.max(0, newX)),
            height: Math.min(Math.abs(height), displayHeight - Math.max(0, newY)),
          });
          return;
        }

        if (dragType === "move" && selection && isMovingSelection && floatingLayerRef.current) {
          const origin = dragStartOriginRef.current;
          if (!origin) return;

          // Calculate total delta from original start position
          let totalDx = imagePos.x - origin.x;
          let totalDy = imagePos.y - origin.y;

          // Shift key constrains to horizontal or vertical movement
          if (e.shiftKey) {
            if (Math.abs(totalDx) > Math.abs(totalDy)) {
              totalDy = 0;
            } else {
              totalDx = 0;
            }
          }

          // Calculate new position
          const baseX = floatingLayerRef.current.originX;
          const baseY = floatingLayerRef.current.originY;
          const newX = Math.max(0, Math.min(baseX + totalDx, displayWidth - selection.width));
          const newY = Math.max(0, Math.min(baseY + totalDy, displayHeight - selection.height));

          floatingLayerRef.current.x = newX;
          floatingLayerRef.current.y = newY;

          if (!isDuplicating) {
            setSelection({
              ...selection,
              x: newX,
              y: newY,
            });
          }
          return;
        }
      }

      if (!cropArea) return;

      // Crop create
      if (dragType === "create") {
        if (canvasExpandMode) {
          // Canvas expand mode - no bounds clamping
          updateCropExpand(
            Math.round(imagePos.x),
            Math.round(imagePos.y),
            dragStartRef.current.x,
            dragStartRef.current.y
          );
        } else {
          // Normal mode - clamp to canvas bounds
          let width = Math.round(imagePos.x) - dragStartRef.current.x;
          let height = Math.round(imagePos.y) - dragStartRef.current.y;

          if (ratioValue) {
            height = Math.round(width / ratioValue);
          }

          const newX = width < 0 ? dragStartRef.current.x + width : dragStartRef.current.x;
          const newY = height < 0 ? dragStartRef.current.y + height : dragStartRef.current.y;

          setCropArea({
            x: Math.max(0, newX),
            y: Math.max(0, newY),
            width: Math.min(Math.abs(width), displayWidth - Math.max(0, newX)),
            height: Math.min(Math.abs(height), displayHeight - Math.max(0, newY)),
          });
        }
      } else if (dragType === "move") {
        // Crop move
        const dx = Math.round(imagePos.x) - dragStartRef.current.x;
        const dy = Math.round(imagePos.y) - dragStartRef.current.y;

        let newX, newY;
        if (canvasExpandMode) {
          // Canvas expand mode - allow moving beyond bounds
          newX = cropArea.x + dx;
          newY = cropArea.y + dy;
        } else {
          // Normal mode - clamp to canvas bounds
          newX = Math.max(0, Math.min(cropArea.x + dx, displayWidth - cropArea.width));
          newY = Math.max(0, Math.min(cropArea.y + dy, displayHeight - cropArea.height));
        }
        setCropArea({ ...cropArea, x: newX, y: newY });
        dragStartRef.current = { x: Math.round(imagePos.x), y: Math.round(imagePos.y) };
      } else if (dragType === "resize" && resizeHandle) {
        // Crop resize
        const newArea = { ...cropArea };
        const dx = Math.round(imagePos.x) - dragStartRef.current.x;
        const dy = Math.round(imagePos.y) - dragStartRef.current.y;

        if (resizeHandle.includes("e")) {
          newArea.width = Math.max(20, cropArea.width + dx);
        }
        if (resizeHandle.includes("w")) {
          newArea.x = cropArea.x + dx;
          newArea.width = Math.max(20, cropArea.width - dx);
        }
        if (resizeHandle.includes("s")) {
          newArea.height = Math.max(20, cropArea.height + dy);
        }
        if (resizeHandle.includes("n")) {
          newArea.y = cropArea.y + dy;
          newArea.height = Math.max(20, cropArea.height - dy);
        }

        if (ratioValue) {
          if (resizeHandle.includes("e") || resizeHandle.includes("w")) {
            newArea.height = Math.round(newArea.width / ratioValue);
          } else {
            newArea.width = Math.round(newArea.height * ratioValue);
          }
        }

        // Only clamp to bounds if not in canvas expand mode
        if (!canvasExpandMode) {
          newArea.x = Math.max(0, newArea.x);
          newArea.y = Math.max(0, newArea.y);
          newArea.width = Math.min(newArea.width, displayWidth - newArea.x);
          newArea.height = Math.min(newArea.height, displayHeight - newArea.y);
        }

        setCropArea(newArea);
        dragStartRef.current = { x: Math.round(imagePos.x), y: Math.round(imagePos.y) };
      }
    },
    [
      getMousePos,
      screenToImage,
      getDisplayDimensions,
      isInBounds,
      isDragging,
      dragType,
      resizeHandle,
      aspectRatio,
      getAspectRatioValue,
      setPan,
      drawOnEditCanvas,
      getActiveToolMode,
      selection,
      setSelection,
      isMovingSelection,
      isDuplicating,
      floatingLayerRef,
      dragStartOriginRef,
      cropArea,
      setCropArea,
      canvasExpandMode,
      updateCropExpand,
    ]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    // Commit floating layer to edit canvas when done moving
    if (isMovingSelection && floatingLayerRef.current) {
      const editCanvas = editCanvasRef.current;
      const ctx = editCanvas?.getContext("2d");
      if (editCanvas && ctx) {
        const { imageData, x, y } = floatingLayerRef.current;

        // Create temp canvas to draw image data
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.putImageData(imageData, 0, 0);
          ctx.drawImage(tempCanvas, x, y);
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

    setIsDragging(false);
    setDragType(null);
    setResizeHandle(null);
    setIsMovingSelection(false);
    setIsDuplicating(false);
    resetLastDrawPoint();
    (dragStartOriginRef as { current: Point | null }).current = null;

    if (cropArea && (cropArea.width < 10 || cropArea.height < 10)) {
      setCropArea(null);
    }

    if (selection && (selection.width < 5 || selection.height < 5)) {
      setSelection(null);
    }
  }, [
    isMovingSelection,
    isDuplicating,
    floatingLayerRef,
    dragStartOriginRef,
    editCanvasRef,
    setIsMovingSelection,
    setIsDuplicating,
    resetLastDrawPoint,
    cropArea,
    setCropArea,
    selection,
    setSelection,
  ]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
    handleMouseUp();
  }, [handleMouseUp]);

  return {
    isDragging,
    dragType,
    resizeHandle,
    mousePos,
    setIsDragging,
    setDragType,
    setResizeHandle,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
  };
}
