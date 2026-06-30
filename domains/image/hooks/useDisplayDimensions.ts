"use client";

import { useCallback, useMemo, type RefObject } from "react";
import { useCanvasViewport } from "@/shared/hooks/useCanvasViewport";
import { VIEWPORT } from "../constants";
import type { Point, Size } from "../types";
import { getDisplayDimensions as getRotatedDisplayDimensions } from "../utils/coordinateSystem";
import { useViewportBridge } from "./useViewportBridge";

interface UseDisplayDimensionsOptions {
  canvasSize: Size;
  rotation: number;
  containerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  zoom: number;
  pan: Point;
  setZoom: (zoom: number | ((zoom: number) => number)) => void;
  setPan: (pan: Point | ((pan: Point) => Point)) => void;
}

export function useDisplayDimensions(options: UseDisplayDimensionsOptions) {
  const {
    canvasSize,
    rotation,
    containerRef,
    canvasRef,
    zoom,
    pan,
    setZoom,
    setPan,
  } = options;

  const displayDimensions = useMemo(
    () => getRotatedDisplayDimensions(canvasSize, rotation),
    [canvasSize, rotation]
  );

  const getDisplayDimensions = useCallback(() => displayDimensions, [displayDimensions]);

  const viewport = useCanvasViewport({
    containerRef,
    canvasRef,
    contentSize: displayDimensions,
    config: {
      origin: "center",
      minZoom: VIEWPORT.MIN_ZOOM,
      maxZoom: VIEWPORT.MAX_ZOOM,
      wheelZoomFactor: VIEWPORT.WHEEL_ZOOM_FACTOR,
    },
  });

  const { canvasRefCallback } = useViewportBridge({
    viewport,
    canvasRef,
    zoom,
    pan,
    setZoom,
    setPan,
  });

  return {
    displayDimensions,
    getDisplayDimensions,
    viewport,
    canvasRefCallback,
  };
}
