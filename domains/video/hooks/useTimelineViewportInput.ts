"use client";

import { useCallback, useEffect, useState } from "react";
import { useTimelineViewport } from "./useTimelineViewport";
import { useDeferredPointerGesture } from "@/shared/hooks";

interface MiddlePanPendingState {
  pointerId: number;
  clientX: number;
  clientY: number;
  scrollXOnStart: number;
  zoomOnStart: number;
}

interface UseTimelineViewportInputOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  tracksContainerRef: React.RefObject<HTMLDivElement | null>;
}

interface UseTimelineViewportInputReturn {
  handleContainerPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function useTimelineViewportInput(
  options: UseTimelineViewportInputOptions
): UseTimelineViewportInputReturn {
  const { containerRef, tracksContainerRef } = options;
  const {
    stateRef: timelineViewportRef,
    panByPixels,
    setZoomAtPixel,
    setScrollFromGestureAnchor,
  } = useTimelineViewport();

  const [middlePanPending, setMiddlePanPending] = useState<MiddlePanPendingState | null>(null);

  const handleContainerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 1) return;

      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const timelineViewport = timelineViewportRef.current;
      setMiddlePanPending({
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        scrollXOnStart: timelineViewport.scrollX,
        zoomOnStart: Math.max(0.001, timelineViewport.zoom),
      });
    },
    [timelineViewportRef]
  );

  useDeferredPointerGesture<MiddlePanPendingState>({
    pending: middlePanPending,
    thresholdPx: 0,
    onMoveResolved: ({ pending, event }) => {
      setScrollFromGestureAnchor(
        pending.scrollXOnStart,
        pending.clientX,
        event.clientX,
        pending.zoomOnStart
      );
    },
    onEnd: () => {
      setMiddlePanPending(null);
    },
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const { zoom } = timelineViewportRef.current;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = tracksContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const nextZoom = Math.max(0.001, zoom * zoomFactor);
        setZoomAtPixel(nextZoom, x);
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        panByPixels(delta);
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [containerRef, tracksContainerRef, timelineViewportRef, panByPixels, setZoomAtPixel]);

  return {
    handleContainerPointerDown,
  };
}

