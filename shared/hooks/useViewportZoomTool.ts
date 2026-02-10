"use client";

import { useCallback, type RefObject } from "react";
import type { Point, Size } from "@/shared/types";
import { clampZoom, zoomAtPoint } from "@/shared/utils";

interface UseViewportZoomToolOptions {
  viewportRef: RefObject<HTMLElement | null>;
  getZoom: () => number;
  getPan: () => Point;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  minZoom: number;
  maxZoom: number;
  zoomInFactor: number;
  zoomOutFactor: number;
  origin?: "center" | "topLeft";
  onZoom?: () => void;
}

interface UseViewportZoomToolReturn {
  zoomAtClientPoint: (clientX: number, clientY: number, zoomOut?: boolean) => void;
}

export function useViewportZoomTool(options: UseViewportZoomToolOptions): UseViewportZoomToolReturn {
  const {
    viewportRef,
    getZoom,
    getPan,
    setZoom,
    setPan,
    minZoom,
    maxZoom,
    zoomInFactor,
    zoomOutFactor,
    origin = "center",
    onZoom,
  } = options;

  const zoomAtClientPoint = useCallback(
    (clientX: number, clientY: number, zoomOut: boolean = false) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();
      const viewportSize: Size = {
        width: rect.width,
        height: rect.height,
      };
      if (viewportSize.width <= 0 || viewportSize.height <= 0) return;

      const pointer: Point = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };

      const currentZoom = getZoom();
      const zoomFactor = zoomOut ? zoomOutFactor : zoomInFactor;
      const nextZoom = clampZoom(currentZoom * zoomFactor, minZoom, maxZoom);
      if (nextZoom === currentZoom) return;

      const result = zoomAtPoint(
        pointer,
        { zoom: currentZoom, pan: getPan(), baseScale: 1 },
        nextZoom,
        origin,
        viewportSize,
      );

      setPan(result.pan);
      setZoom(result.zoom);
      onZoom?.();
    },
    [
      viewportRef,
      getZoom,
      getPan,
      setPan,
      setZoom,
      minZoom,
      maxZoom,
      zoomInFactor,
      zoomOutFactor,
      origin,
      onZoom,
    ],
  );

  return { zoomAtClientPoint };
}
