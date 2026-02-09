"use client";

import { useCallback, useRef } from "react";
import { useTimeline } from "../contexts";
import { TIMELINE } from "../constants";
import {
  normalizeTimelineZoom,
  panTimelineScrollXByPixels,
  timelineScrollXFromGestureAnchor,
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

  const stateRef = useRef<TimelineViewportState>({
    scrollX: viewState.scrollX,
    zoom: viewState.zoom,
  });
  stateRef.current = { scrollX: viewState.scrollX, zoom: viewState.zoom };

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
    setScrollFromGestureAnchor,
  };
}
