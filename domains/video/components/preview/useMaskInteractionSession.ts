"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MaskRegion } from "../../contexts/MaskContext";
import type { MaskDrawShape } from "../../types";
import { getPointerPressure } from "@/shared/utils/pointerPressure";

interface MaskPoint {
  x: number;
  y: number;
}

interface MaskRectDragState {
  start: MaskPoint;
  current: MaskPoint;
}

interface UseMaskInteractionSessionOptions {
  isEditingMask: boolean;
  activeTrackId: string | null;
  maskDrawShape: MaskDrawShape;
  brushMode: "paint" | "erase";
  maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  maskRegion: MaskRegion | null;
  setMaskRegion: (region: MaskRegion | null) => void;
  setBrushMode: (mode: "paint" | "erase") => void;
  screenToMaskCoords: (clientX: number, clientY: number) => MaskPoint | null;
  startDraw: (x: number, y: number, pressure?: number) => void;
  continueDraw: (x: number, y: number, pressure?: number) => void;
  endDraw: () => void;
  saveMaskData: () => void;
  saveMaskHistoryPoint: () => void;
  scheduleRender: () => void;
}

interface VisibleMaskRegion {
  region: MaskRegion;
  isDragging: boolean;
}

interface UseMaskInteractionSessionResult {
  clearMaskRegionSelection: () => boolean;
  getVisibleMaskRegion: () => VisibleMaskRegion | null;
  handleMaskPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleMaskPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleMaskPointerUp: () => void;
}

function createMaskRegionFromPoints(start: MaskPoint, current: MaskPoint): MaskRegion {
  const x = Math.round(Math.min(start.x, current.x));
  const y = Math.round(Math.min(start.y, current.y));
  const width = Math.round(Math.max(1, Math.abs(current.x - start.x)));
  const height = Math.round(Math.max(1, Math.abs(current.y - start.y)));
  return { x, y, width, height };
}

export function useMaskInteractionSession({
  isEditingMask,
  activeTrackId,
  maskDrawShape,
  brushMode,
  maskCanvasRef,
  maskRegion,
  setMaskRegion,
  setBrushMode,
  screenToMaskCoords,
  startDraw,
  continueDraw,
  endDraw,
  saveMaskData,
  saveMaskHistoryPoint,
  scheduleRender,
}: UseMaskInteractionSessionOptions): UseMaskInteractionSessionResult {
  const isMaskDrawingRef = useRef(false);
  const isMaskRegionDraggingRef = useRef(false);
  const maskClipActiveRef = useRef(false);
  const maskRectDragRef = useRef<MaskRectDragState | null>(null);
  const maskRegionRef = useRef<MaskRegion | null>(maskRegion);
  const prevBrushModeRef = useRef<"paint" | "erase" | null>(null);

  maskRegionRef.current = maskRegion;

  const updateMaskRegion = useCallback((nextRegion: MaskRegion | null) => {
    maskRegionRef.current = nextRegion;
    setMaskRegion(nextRegion);
  }, [setMaskRegion]);

  const applyMaskRegionClip = useCallback((region: MaskRegion) => {
    if (maskClipActiveRef.current) return;
    const ctx = maskCanvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x, region.y, region.width, region.height);
    ctx.clip();
    maskClipActiveRef.current = true;
  }, [maskCanvasRef]);

  const clearMaskRegionClip = useCallback(() => {
    if (!maskClipActiveRef.current) return;
    const ctx = maskCanvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.restore();
    }
    maskClipActiveRef.current = false;
  }, [maskCanvasRef]);

  const restoreBrushModeIfNeeded = useCallback(() => {
    if (prevBrushModeRef.current === null) return;
    setBrushMode(prevBrushModeRef.current);
    prevBrushModeRef.current = null;
  }, [setBrushMode]);

  const clearMaskRegionSelection = useCallback(() => {
    const hadRegion = Boolean(maskRegionRef.current || maskRectDragRef.current || isMaskRegionDraggingRef.current);
    const hadClip = maskClipActiveRef.current;
    const hadDrawing = isMaskDrawingRef.current;
    if (!hadRegion && !hadClip && !hadDrawing) return false;

    updateMaskRegion(null);
    maskRectDragRef.current = null;
    isMaskRegionDraggingRef.current = false;
    if (hadDrawing) {
      endDraw();
      isMaskDrawingRef.current = false;
    }

    clearMaskRegionClip();
    restoreBrushModeIfNeeded();
    scheduleRender();
    return true;
  }, [clearMaskRegionClip, endDraw, restoreBrushModeIfNeeded, scheduleRender, updateMaskRegion]);

  const handleMaskPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (!isEditingMask || !activeTrackId) return false;

    const maskCoords = screenToMaskCoords(e.clientX, e.clientY);
    if (!maskCoords) return false;

    if (maskDrawShape === "rectangle") {
      isMaskRegionDraggingRef.current = true;
      maskRectDragRef.current = {
        start: maskCoords,
        current: maskCoords,
      };
      scheduleRender();
      return true;
    }

    if (e.altKey && brushMode !== "erase") {
      prevBrushModeRef.current = brushMode;
      setBrushMode("erase");
    }

    saveMaskHistoryPoint();
    if (maskRegionRef.current) {
      applyMaskRegionClip(maskRegionRef.current);
    }

    startDraw(maskCoords.x, maskCoords.y, getPointerPressure(e));
    isMaskDrawingRef.current = true;
    scheduleRender();
    return true;
  }, [
    isEditingMask,
    activeTrackId,
    screenToMaskCoords,
    maskDrawShape,
    brushMode,
    setBrushMode,
    saveMaskHistoryPoint,
    applyMaskRegionClip,
    startDraw,
    scheduleRender,
  ]);

  const handleMaskPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (isMaskRegionDraggingRef.current) {
      const maskCoords = screenToMaskCoords(e.clientX, e.clientY);
      if (maskCoords && maskRectDragRef.current) {
        maskRectDragRef.current.current = maskCoords;
        scheduleRender();
      }
      return true;
    }

    if (!isMaskDrawingRef.current) return false;

    const maskCoords = screenToMaskCoords(e.clientX, e.clientY);
    if (maskCoords) {
      continueDraw(maskCoords.x, maskCoords.y, getPointerPressure(e));
      scheduleRender();
    }
    return true;
  }, [continueDraw, scheduleRender, screenToMaskCoords]);

  const handleMaskPointerUp = useCallback(() => {
    if (isMaskRegionDraggingRef.current) {
      const rectDrag = maskRectDragRef.current;
      isMaskRegionDraggingRef.current = false;
      maskRectDragRef.current = null;

      if (rectDrag) {
        const region = createMaskRegionFromPoints(rectDrag.start, rectDrag.current);
        if (region.width < 2 || region.height < 2) {
          updateMaskRegion(null);
        } else {
          updateMaskRegion(region);
        }
      }
      scheduleRender();
    }

    if (isMaskDrawingRef.current) {
      endDraw();
      isMaskDrawingRef.current = false;
      clearMaskRegionClip();
      saveMaskData();
      restoreBrushModeIfNeeded();
      scheduleRender();
      return;
    }

    clearMaskRegionClip();
  }, [
    clearMaskRegionClip,
    endDraw,
    restoreBrushModeIfNeeded,
    saveMaskData,
    scheduleRender,
    updateMaskRegion,
  ]);

  const getVisibleMaskRegion = useCallback((): VisibleMaskRegion | null => {
    const drag = maskRectDragRef.current;
    if (maskDrawShape === "rectangle" && drag) {
      return {
        region: createMaskRegionFromPoints(drag.start, drag.current),
        isDragging: true,
      };
    }

    if (!maskRegionRef.current) return null;
    return {
      region: maskRegionRef.current,
      isDragging: false,
    };
  }, [maskDrawShape]);

  useEffect(() => {
    return () => {
      clearMaskRegionClip();
      restoreBrushModeIfNeeded();
    };
  }, [clearMaskRegionClip, restoreBrushModeIfNeeded]);

  return {
    clearMaskRegionSelection,
    getVisibleMaskRegion,
    handleMaskPointerDown,
    handleMaskPointerMove,
    handleMaskPointerUp,
  };
}
