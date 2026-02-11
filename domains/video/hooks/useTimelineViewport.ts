"use client";

import { useCallback, useRef } from "react";
import { useTimeline } from "../contexts";
import { TIMELINE } from "../constants";
import {
  normalizeTimelineZoom,
  panTimelineScrollXByPixels,
  timelineScrollXFromGestureAnchor,
  timelineZoomFromWheelDelta,
  zoomTimelineAtPixel,
} from "../utils/timelineViewportMath";

interface TimelineViewportState {
  scrollX: number;
  zoom: number;
}

interface ZoomAtPixelOptions {
  minZoom?: number;
  maxZoom?: number;
}

export function useTimelineViewport() {
  const { viewState, setScrollX, setZoom } = useTimeline();
  const safeScrollX = Math.max(0, Number.isFinite(viewState.scrollX) ? viewState.scrollX : 0);
  const safeZoom = normalizeTimelineZoom(viewState.zoom);

  const stateRef = useRef<TimelineViewportState>({
    scrollX: safeScrollX,
    zoom: safeZoom,
  });
  stateRef.current = { scrollX: safeScrollX, zoom: safeZoom };

  const getState = useCallback(() => stateRef.current, []);

  const setScrollXImmediate = useCallback(
    (scrollX: number): number => {
      const nextScrollX = Math.max(0, scrollX);
      stateRef.current = { ...stateRef.current, scrollX: nextScrollX };
      setScrollX(nextScrollX);
      return nextScrollX;
    },
    [setScrollX]
  );

  const panByPixels = useCallback(
    (deltaPixels: number): number => {
      const { scrollX, zoom } = stateRef.current;
      const nextScrollX = panTimelineScrollXByPixels(scrollX, deltaPixels, zoom);
      return setScrollXImmediate(nextScrollX);
    },
    [setScrollXImmediate]
  );

  const ensureTimeVisibleOnLeft = useCallback(
    (time: number): boolean => {
      const safeTime = Math.max(0, time);
      if (safeTime < stateRef.current.scrollX) {
        setScrollXImmediate(safeTime);
        return true;
      }
      return false;
    },
    [setScrollXImmediate]
  );

  const setZoomAtPixel = useCallback(
    (nextZoom: number, anchorPixel: number, options?: ZoomAtPixelOptions) => {
      const minZoom = options?.minZoom ?? TIMELINE.MIN_ZOOM;
      const maxZoom = options?.maxZoom ?? TIMELINE.MAX_ZOOM;
      const clampedZoom = Math.max(minZoom, Math.min(maxZoom, normalizeTimelineZoom(nextZoom)));

      const { scrollX, zoom } = stateRef.current;
      if (Math.abs(clampedZoom - zoom) < 0.0001) return;

      const nextScrollX = zoomTimelineAtPixel(scrollX, zoom, clampedZoom, anchorPixel);
      stateRef.current = { scrollX: nextScrollX, zoom: clampedZoom };
      setZoom(clampedZoom);
      setScrollX(nextScrollX);
    },
    [setZoom, setScrollX]
  );

  const setZoomFromWheelAtPixel = useCallback(
    (deltaY: number, anchorPixel: number, options?: ZoomAtPixelOptions) => {
      const { zoom } = stateRef.current;
      const wheelZoomFactor = TIMELINE.WHEEL_ZOOM_FACTOR;
      const nextZoom = timelineZoomFromWheelDelta(zoom, deltaY, wheelZoomFactor);
      setZoomAtPixel(nextZoom, anchorPixel, options);
    },
    [setZoomAtPixel]
  );

  const setScrollFromGestureAnchor = useCallback(
    (
      gestureStartScrollX: number,
      gestureStartClientX: number,
      currentClientX: number,
      gestureZoom: number
    ): number => {
      const nextScrollX = timelineScrollXFromGestureAnchor(
        gestureStartScrollX,
        gestureStartClientX,
        currentClientX,
        gestureZoom
      );
      return setScrollXImmediate(nextScrollX);
    },
    [setScrollXImmediate]
  );

  return {
    stateRef,
    getState,
    setScrollXImmediate,
    panByPixels,
    ensureTimeVisibleOnLeft,
    setZoomAtPixel,
    setZoomFromWheelAtPixel,
    setScrollFromGestureAnchor,
  };
}
