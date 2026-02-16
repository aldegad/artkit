"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

interface PinchPointer {
  clientX: number;
  clientY: number;
}

interface PinchSession {
  initialDistance: number;
  initialZoom: number;
}

interface TouchPointerEventLike {
  pointerId: number;
  clientX: number;
  clientY: number;
  preventDefault: () => void;
}

interface UseTimelinePinchZoomOptions {
  tracksContainerRef: RefObject<HTMLDivElement | null>;
  getCurrentZoom: () => number;
  setZoomAtPixel: (nextZoom: number, anchorX: number) => void;
  onPinchStart?: () => void;
}

export function useTimelinePinchZoom(options: UseTimelinePinchZoomOptions) {
  const { tracksContainerRef, getCurrentZoom, setZoomAtPixel, onPinchStart } = options;

  const pinchPointersRef = useRef<Map<number, PinchPointer>>(new Map());
  const pinchSessionRef = useRef<PinchSession | null>(null);
  const isPinchingRef = useRef(false);

  const getPinchDistance = useCallback((first: PinchPointer, second: PinchPointer) => {
    const dx = first.clientX - second.clientX;
    const dy = first.clientY - second.clientY;
    return Math.hypot(dx, dy);
  }, []);

  const resetPinchState = useCallback(() => {
    pinchPointersRef.current.clear();
    pinchSessionRef.current = null;
    isPinchingRef.current = false;
  }, []);

  const handleTouchPinchPointerDown = useCallback((event: TouchPointerEventLike): boolean => {
    pinchPointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (pinchPointersRef.current.size < 2) {
      return false;
    }

    event.preventDefault();
    const pointers = Array.from(pinchPointersRef.current.values());
    const first = pointers[0];
    const second = pointers[1];
    if (!first || !second) {
      return true;
    }

    const initialDistance = getPinchDistance(first, second);
    if (initialDistance > 0) {
      pinchSessionRef.current = {
        initialDistance,
        initialZoom: getCurrentZoom(),
      };
      isPinchingRef.current = true;
      onPinchStart?.();
    }

    return true;
  }, [getCurrentZoom, getPinchDistance, onPinchStart]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!pinchPointersRef.current.has(event.pointerId)) return;
      pinchPointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });

      if (!isPinchingRef.current || !pinchSessionRef.current) return;
      if (pinchPointersRef.current.size < 2) return;

      const points = Array.from(pinchPointersRef.current.values());
      const first = points[0];
      const second = points[1];
      if (!first || !second) return;

      const currentDistance = getPinchDistance(first, second);
      if (currentDistance <= 0) return;

      const rect = tracksContainerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const ratio = currentDistance / pinchSessionRef.current.initialDistance;
      const nextZoom = pinchSessionRef.current.initialZoom * ratio;
      const centerX = (first.clientX + second.clientX) / 2;
      const anchorX = Math.max(0, Math.min(centerX - rect.left, rect.width));

      event.preventDefault();
      setZoomAtPixel(nextZoom, anchorX);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (!pinchPointersRef.current.has(event.pointerId)) return;
      pinchPointersRef.current.delete(event.pointerId);

      if (pinchPointersRef.current.size < 2) {
        isPinchingRef.current = false;
        pinchSessionRef.current = null;
      }
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [getPinchDistance, tracksContainerRef, setZoomAtPixel]);

  useEffect(() => {
    return () => {
      resetPinchState();
    };
  }, [resetPinchState]);

  return {
    handleTouchPinchPointerDown,
    resetPinchState,
  };
}
