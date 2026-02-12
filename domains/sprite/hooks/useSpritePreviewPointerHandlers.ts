"use client";

import { useCallback, useState } from "react";
import { safeReleasePointerCapture, safeSetPointerCapture } from "@/shared/utils";
import type { SpriteFrame } from "../types";

interface Point {
  x: number;
  y: number;
}

interface UseSpritePreviewPointerHandlersOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeTouchPointerIdsRef: React.MutableRefObject<Set<number>>;
  isPanLocked: boolean;
  isHandMode: boolean;
  isZoomTool: boolean;
  isEyedropperTool: boolean;
  isEditMode: boolean;
  isBrushEditMode: boolean;
  isMagicWandTool: boolean;
  isAiSelecting: boolean;
  isPlaying: boolean;
  isDrawing: boolean;
  editableFrame: SpriteFrame | null;
  zoomAtCursor: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  pickColorFromComposited: (clientX: number, clientY: number) => void;
  handleCropPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleCropPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleCropPointerUp: () => void;
  cancelCropDrag: () => void;
  applyMagicWandSelection: (x: number, y: number) => Promise<void>;
  startBrushStroke: (e: React.PointerEvent<HTMLCanvasElement>, coords: Point) => void;
  continueBrushStroke: (e: React.PointerEvent<HTMLCanvasElement>, coords: Point) => void;
  endBrushStroke: (pointerId: number) => boolean;
  cancelBrushStroke: () => void;
  getPixelCoordinates: (clientX: number, clientY: number) => Point | null;
  setIsPlaying: (isPlaying: boolean) => void;
}

interface UseSpritePreviewPointerHandlersResult {
  cursorPos: Point | null;
  isOverCanvas: boolean;
  resetPointerOverlayState: () => void;
  handlePreviewCanvasPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePreviewCanvasPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePreviewCanvasPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePreviewCanvasPointerEnter: () => void;
  handlePreviewCanvasPointerLeave: (e: React.PointerEvent<HTMLCanvasElement>) => void;
}

export function useSpritePreviewPointerHandlers(
  options: UseSpritePreviewPointerHandlersOptions
): UseSpritePreviewPointerHandlersResult {
  const {
    canvasRef,
    activeTouchPointerIdsRef,
    isPanLocked,
    isHandMode,
    isZoomTool,
    isEyedropperTool,
    isEditMode,
    isBrushEditMode,
    isMagicWandTool,
    isAiSelecting,
    isPlaying,
    isDrawing,
    editableFrame,
    zoomAtCursor,
    pickColorFromComposited,
    handleCropPointerDown,
    handleCropPointerMove,
    handleCropPointerUp,
    cancelCropDrag,
    applyMagicWandSelection,
    startBrushStroke,
    continueBrushStroke,
    endBrushStroke,
    cancelBrushStroke,
    getPixelCoordinates,
    setIsPlaying,
  } = options;
  const [cursorPos, setCursorPos] = useState<Point | null>(null);
  const [isOverCanvas, setIsOverCanvas] = useState(false);

  const resetPointerOverlayState = useCallback(() => {
    setCursorPos(null);
    setIsOverCanvas(false);
  }, []);

  const handlePreviewCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      activeTouchPointerIdsRef.current.add(e.pointerId);
    }

    if (activeTouchPointerIdsRef.current.size > 1) {
      cancelBrushStroke();
      return;
    }

    const isTouchPanOnlyInput = isPanLocked && e.pointerType === "touch";
    if (isTouchPanOnlyInput || isHandMode) {
      return;
    }

    if (isZoomTool) {
      zoomAtCursor(e);
      return;
    }

    if (isEyedropperTool) {
      pickColorFromComposited(e.clientX, e.clientY);
      return;
    }

    if (handleCropPointerDown(e)) {
      e.preventDefault();
      safeSetPointerCapture(e.currentTarget, e.pointerId);
      return;
    }

    if (!isEditMode || !editableFrame) {
      return;
    }

    const coords = getPixelCoordinates(e.clientX, e.clientY);
    if (!coords) return;

    if (isMagicWandTool) {
      if (isAiSelecting) {
        return;
      }
      void applyMagicWandSelection(coords.x, coords.y);
      return;
    }

    if (!isBrushEditMode) {
      return;
    }

    if (isPlaying) {
      setIsPlaying(false);
    }

    startBrushStroke(e, coords);
    safeSetPointerCapture(e.currentTarget, e.pointerId);
  }, [
    activeTouchPointerIdsRef,
    cancelBrushStroke,
    isPanLocked,
    isHandMode,
    isZoomTool,
    zoomAtCursor,
    isEyedropperTool,
    pickColorFromComposited,
    handleCropPointerDown,
    isEditMode,
    editableFrame,
    getPixelCoordinates,
    isMagicWandTool,
    isAiSelecting,
    applyMagicWandSelection,
    isBrushEditMode,
    isPlaying,
    setIsPlaying,
    startBrushStroke,
  ]);

  const handlePreviewCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (e.pointerType === "touch" && activeTouchPointerIdsRef.current.size > 1) {
      return;
    }

    if (handleCropPointerMove(e)) {
      return;
    }

    if (!isEditMode || !isDrawing || !editableFrame) {
      return;
    }

    const coords = getPixelCoordinates(e.clientX, e.clientY);
    if (!coords) return;
    continueBrushStroke(e, coords);
  }, [
    canvasRef,
    activeTouchPointerIdsRef,
    handleCropPointerMove,
    isEditMode,
    isDrawing,
    editableFrame,
    getPixelCoordinates,
    continueBrushStroke,
  ]);

  const handlePreviewCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      activeTouchPointerIdsRef.current.delete(e.pointerId);
    }

    safeReleasePointerCapture(e.currentTarget, e.pointerId);

    endBrushStroke(e.pointerId);
    handleCropPointerUp();
  }, [activeTouchPointerIdsRef, endBrushStroke, handleCropPointerUp]);

  const handlePreviewCanvasPointerEnter = useCallback(() => {
    setIsOverCanvas(true);
  }, []);

  const handlePreviewCanvasPointerLeave = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      activeTouchPointerIdsRef.current.delete(e.pointerId);
    }
    setIsOverCanvas(false);
    setCursorPos(null);

    endBrushStroke(e.pointerId);
    cancelCropDrag();
  }, [activeTouchPointerIdsRef, endBrushStroke, cancelCropDrag]);

  return {
    cursorPos,
    isOverCanvas,
    resetPointerOverlayState,
    handlePreviewCanvasPointerDown,
    handlePreviewCanvasPointerMove,
    handlePreviewCanvasPointerUp,
    handlePreviewCanvasPointerEnter,
    handlePreviewCanvasPointerLeave,
  };
}
