"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ASPECT_RATIO_VALUES, type AspectRatio } from "@/shared/types/aspectRatio";
import {
  createRectFromDrag,
  getRectHandleAtPosition,
  resizeRectByHandle,
  type RectHandle,
} from "@/shared/utils/rectTransform";

type CropArea = { x: number; y: number; width: number; height: number } | null;
type CropDragMode = "none" | "create" | "move" | "resize";

interface CropPoint {
  x: number;
  y: number;
}

interface CropBounds {
  width: number;
  height: number;
}

interface CropDragState {
  mode: CropDragMode;
  pointerStart: CropPoint;
  cropStart: { x: number; y: number; width: number; height: number } | null;
  resizeHandle: RectHandle | null;
}

interface UseSpriteCropInteractionSessionOptions {
  isCropMode: boolean;
  cropArea: CropArea;
  setCropArea: (area: CropArea) => void;
  cropAspectRatio: AspectRatio;
  lockCropAspect: boolean;
  canvasExpandMode: boolean;
  getPixelCoordinates: (clientX: number, clientY: number) => CropPoint | null;
  getCropCanvasBounds: () => CropBounds | null;
  clampToCropCanvas: (point: CropPoint) => CropPoint;
}

interface UseSpriteCropInteractionSessionResult {
  cropCursor: string;
  cropDragMode: CropDragMode;
  isDraggingCrop: boolean;
  handleCropPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleCropPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleCropPointerUp: () => void;
  cancelCropDrag: () => void;
}

const DEFAULT_DRAG_STATE: CropDragState = {
  mode: "none",
  pointerStart: { x: 0, y: 0 },
  cropStart: null,
  resizeHandle: null,
};

export function useSpriteCropInteractionSession({
  isCropMode,
  cropArea,
  setCropArea,
  cropAspectRatio,
  lockCropAspect,
  canvasExpandMode,
  getPixelCoordinates,
  getCropCanvasBounds,
  clampToCropCanvas,
}: UseSpriteCropInteractionSessionOptions): UseSpriteCropInteractionSessionResult {
  const dragStateRef = useRef<CropDragState>(DEFAULT_DRAG_STATE);
  const originalCropAreaRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [cropCursor, setCropCursor] = useState<string>("crosshair");
  const [cropDragMode, setCropDragMode] = useState<CropDragMode>("none");
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);

  const setDragState = useCallback((next: CropDragState) => {
    dragStateRef.current = next;
    setCropDragMode(next.mode);
  }, []);

  const resetDragState = useCallback(() => {
    originalCropAreaRef.current = null;
    setDragState(DEFAULT_DRAG_STATE);
    setIsDraggingCrop(false);
  }, [setDragState]);

  const handleCropPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (!isCropMode) return false;

    const rawPoint = getPixelCoordinates(e.clientX, e.clientY);
    if (!rawPoint) return false;
    const bounds = getCropCanvasBounds();
    if (!bounds) return false;
    const point = canvasExpandMode ? rawPoint : clampToCropCanvas(rawPoint);

    if (cropArea && cropArea.width > 0 && cropArea.height > 0) {
      const hit = getRectHandleAtPosition(point, cropArea, {
        handleSize: 12,
        includeMove: true,
      });

      if (hit && hit !== "move") {
        originalCropAreaRef.current = { ...cropArea };
        setDragState({
          mode: "resize",
          pointerStart: point,
          cropStart: { ...cropArea },
          resizeHandle: hit as RectHandle,
        });
        setIsDraggingCrop(true);
        return true;
      }

      if (hit === "move") {
        setDragState({
          mode: "move",
          pointerStart: point,
          cropStart: { ...cropArea },
          resizeHandle: null,
        });
        setIsDraggingCrop(true);
        return true;
      }
    }

    const nextArea = {
      x: Math.round(point.x),
      y: Math.round(point.y),
      width: 0,
      height: 0,
    };
    setCropArea(nextArea);
    setDragState({
      mode: "create",
      pointerStart: point,
      cropStart: nextArea,
      resizeHandle: null,
    });
    setIsDraggingCrop(true);
    return true;
  }, [
    isCropMode,
    getPixelCoordinates,
    getCropCanvasBounds,
    canvasExpandMode,
    clampToCropCanvas,
    cropArea,
    setCropArea,
    setDragState,
  ]);

  const handleCropPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (!isCropMode) return false;

    const dragState = dragStateRef.current;
    if (dragState.mode === "none") {
      const hoverPoint = getPixelCoordinates(e.clientX, e.clientY);
      if (hoverPoint && cropArea && cropArea.width > 0 && cropArea.height > 0) {
        const hit = getRectHandleAtPosition(hoverPoint, cropArea, {
          handleSize: 12,
          includeMove: true,
        });
        if (hit && hit !== "move") {
          const cursorMap: Record<string, string> = {
            nw: "nwse-resize",
            se: "nwse-resize",
            ne: "nesw-resize",
            sw: "nesw-resize",
            n: "ns-resize",
            s: "ns-resize",
            e: "ew-resize",
            w: "ew-resize",
          };
          setCropCursor(cursorMap[hit] || "crosshair");
        } else if (hit === "move") {
          setCropCursor("move");
        } else {
          setCropCursor("crosshair");
        }
      } else {
        setCropCursor("crosshair");
      }
      return true;
    }

    const rawPoint = getPixelCoordinates(e.clientX, e.clientY);
    if (!rawPoint) return true;
    const point = canvasExpandMode ? rawPoint : clampToCropCanvas(rawPoint);
    const bounds = getCropCanvasBounds();
    if (!bounds) return true;

    if (dragState.mode === "create") {
      const ratioValue = ASPECT_RATIO_VALUES[cropAspectRatio] ?? null;
      const clampedPos = canvasExpandMode
        ? point
        : {
            x: Math.max(0, Math.min(Math.round(point.x), bounds.width)),
            y: Math.max(0, Math.min(Math.round(point.y), bounds.height)),
          };
      const nextArea = createRectFromDrag(dragState.pointerStart, clampedPos, {
        keepAspect: Boolean(ratioValue),
        targetAspect: ratioValue ?? undefined,
        round: true,
        bounds: canvasExpandMode
          ? undefined
          : {
              minX: 0,
              minY: 0,
              maxX: bounds.width,
              maxY: bounds.height,
            },
      });
      setCropArea(nextArea);
      return true;
    }

    if (dragState.mode === "move" && dragState.cropStart) {
      const start = dragState.cropStart;
      const dx = point.x - dragState.pointerStart.x;
      const dy = point.y - dragState.pointerStart.y;
      let nextX = start.x + dx;
      let nextY = start.y + dy;

      if (!canvasExpandMode) {
        nextX = Math.max(0, Math.min(bounds.width - start.width, nextX));
        nextY = Math.max(0, Math.min(bounds.height - start.height, nextY));
      }

      setCropArea({
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.round(start.width),
        height: Math.round(start.height),
      });
      return true;
    }

    if (dragState.mode === "resize" && originalCropAreaRef.current && dragState.resizeHandle) {
      const orig = originalCropAreaRef.current;
      const dx = point.x - dragState.pointerStart.x;
      const dy = point.y - dragState.pointerStart.y;
      const ratioValue = ASPECT_RATIO_VALUES[cropAspectRatio] ?? null;
      const originalAspect = orig.width / Math.max(1, orig.height);
      const effectiveRatio = ratioValue || (lockCropAspect ? originalAspect : null);

      let newArea = resizeRectByHandle(
        orig,
        dragState.resizeHandle,
        { dx, dy },
        {
          minWidth: 10,
          minHeight: 10,
          keepAspect: Boolean(effectiveRatio),
          targetAspect: effectiveRatio ?? undefined,
        },
      );

      if (!canvasExpandMode) {
        newArea = {
          x: Math.max(0, newArea.x),
          y: Math.max(0, newArea.y),
          width: Math.min(newArea.width, bounds.width - Math.max(0, newArea.x)),
          height: Math.min(newArea.height, bounds.height - Math.max(0, newArea.y)),
        };
      }

      setCropArea({
        x: Math.round(newArea.x),
        y: Math.round(newArea.y),
        width: Math.round(newArea.width),
        height: Math.round(newArea.height),
      });
      return true;
    }

    return true;
  }, [
    isCropMode,
    getPixelCoordinates,
    cropArea,
    canvasExpandMode,
    clampToCropCanvas,
    getCropCanvasBounds,
    cropAspectRatio,
    setCropArea,
    lockCropAspect,
  ]);

  const handleCropPointerUp = useCallback(() => {
    resetDragState();

    if (cropArea && (cropArea.width < 10 || cropArea.height < 10)) {
      setCropArea(null);
    }
  }, [cropArea, resetDragState, setCropArea]);

  const cancelCropDrag = useCallback(() => {
    if (dragStateRef.current.mode === "none") return;
    resetDragState();
  }, [resetDragState]);

  useEffect(() => {
    if (isCropMode) return;
    resetDragState();
    setCropCursor("crosshair");
  }, [isCropMode, resetDragState]);

  return {
    cropCursor,
    cropDragMode,
    isDraggingCrop,
    handleCropPointerDown,
    handleCropPointerMove,
    handleCropPointerUp,
    cancelCropDrag,
  };
}
