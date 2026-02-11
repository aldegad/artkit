"use client";

import { useCallback } from "react";
import { useTimeline } from "../contexts";
import {
  pixelToTimelineTime,
  timelineTimeToPixel,
  normalizeTimelineZoom,
} from "../utils/timelineViewportMath";

/**
 * Hook for converting between time and pixel coordinates on the timeline
 */
export function useVideoCoordinates() {
  const { viewState } = useTimeline();
  const zoom = normalizeTimelineZoom(viewState.zoom);
  const scrollX = Math.max(0, Number.isFinite(viewState.scrollX) ? viewState.scrollX : 0);

  /**
   * Convert a time value (seconds) to a pixel position on the timeline
   */
  const timeToPixel = useCallback(
    (time: number): number => {
      return timelineTimeToPixel(time, scrollX, zoom);
    },
    [scrollX, zoom]
  );

  /**
   * Convert a pixel position on the timeline to a time value (seconds)
   */
  const pixelToTime = useCallback(
    (pixel: number): number => {
      return pixelToTimelineTime(pixel, scrollX, zoom);
    },
    [scrollX, zoom]
  );

  /**
   * Convert a duration (seconds) to a pixel width
   */
  const durationToWidth = useCallback(
    (duration: number): number => {
      return duration * normalizeTimelineZoom(zoom);
    },
    [zoom]
  );

  /**
   * Convert a pixel width to a duration (seconds)
   */
  const widthToDuration = useCallback(
    (width: number): number => {
      return width / normalizeTimelineZoom(zoom);
    },
    [zoom]
  );

  /**
   * Get the visible time range based on container width
   */
  const getVisibleTimeRange = useCallback(
    (containerWidth: number): { start: number; end: number } => {
      return {
        start: scrollX,
        end: pixelToTimelineTime(containerWidth, scrollX, zoom),
      };
    },
    [scrollX, zoom]
  );

  /**
   * Snap a time value to the nearest snap point (if snap is enabled)
   */
  const snapTime = useCallback(
    (time: number, snapPoints: number[], threshold: number = 0.1): number => {
      for (const point of snapPoints) {
        if (Math.abs(time - point) < threshold) {
          return point;
        }
      }
      return time;
    },
    []
  );

  /**
   * Check if a time is within the visible range
   */
  const isTimeVisible = useCallback(
    (time: number, containerWidth: number): boolean => {
      const { start, end } = getVisibleTimeRange(containerWidth);
      return time >= start && time <= end;
    },
    [getVisibleTimeRange]
  );

  return {
    timeToPixel,
    pixelToTime,
    durationToWidth,
    widthToDuration,
    getVisibleTimeRange,
    snapTime,
    isTimeVisible,
    // Expose raw values for direct use
    zoom,
    scrollX,
  };
}
