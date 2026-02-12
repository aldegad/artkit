"use client";

import { useCallback, useRef } from "react";

interface Point {
  x: number;
  y: number;
}

interface UseSpritePanPointerSessionParams {
  isPanLocked: boolean;
  isPanning: boolean;
  isHandTool: boolean;
  startPanDrag: (point: Point) => void;
  updatePanDrag: (point: Point) => void;
  endPanDrag: () => void;
  isPanDragging: () => boolean;
  onContainerPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

interface UseSpritePanPointerSessionResult {
  activeTouchPointerIdsRef: React.MutableRefObject<Set<number>>;
  handleContainerPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleContainerPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleContainerPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function useSpritePanPointerSession({
  isPanLocked,
  isPanning,
  isHandTool,
  startPanDrag,
  updatePanDrag,
  endPanDrag,
  isPanDragging,
  onContainerPointerUp,
}: UseSpritePanPointerSessionParams): UseSpritePanPointerSessionResult {
  const activeTouchPointerIdsRef = useRef<Set<number>>(new Set());

  const handleContainerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") {
      activeTouchPointerIdsRef.current.add(e.pointerId);
    }

    const isTouchPanOnlyInput = isPanLocked && e.pointerType === "touch";
    if (isTouchPanOnlyInput && !e.isPrimary) {
      return;
    }

    if (activeTouchPointerIdsRef.current.size > 1) {
      endPanDrag();
      return;
    }

    if (isPanning || isHandTool || isTouchPanOnlyInput) {
      e.preventDefault();
      startPanDrag({ x: e.clientX, y: e.clientY });
    }
  }, [endPanDrag, isHandTool, isPanLocked, isPanning, startPanDrag]);

  const handleContainerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" && activeTouchPointerIdsRef.current.size > 1) {
      endPanDrag();
      return;
    }

    if (isPanDragging()) {
      updatePanDrag({ x: e.clientX, y: e.clientY });
    }
  }, [endPanDrag, isPanDragging, updatePanDrag]);

  const handleContainerPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") {
      activeTouchPointerIdsRef.current.delete(e.pointerId);
    }
    if (activeTouchPointerIdsRef.current.size <= 1) {
      endPanDrag();
    }
    onContainerPointerUp?.(e);
  }, [endPanDrag, onContainerPointerUp]);

  return {
    activeTouchPointerIdsRef,
    handleContainerPointerDown,
    handleContainerPointerMove,
    handleContainerPointerUp,
  };
}
