"use client";

import { useCallback } from "react";
import {
  useCanvasViewportBridge,
  type CanvasViewportBridgeLike,
  type CanvasViewportState,
} from "@/shared/hooks";
import { Point } from "../types";

interface UseViewportBridgeOptions {
  viewport: CanvasViewportBridgeLike;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  zoom: number;
  pan: Point;
  setZoom: (zoom: number | ((z: number) => number)) => void;
  setPan: (pan: Point | ((p: Point) => Point)) => void;
}

interface UseViewportBridgeReturn {
  canvasRefCallback: (canvas: HTMLCanvasElement | null) => void;
}

export function useViewportBridge(options: UseViewportBridgeOptions): UseViewportBridgeReturn {
  const { viewport, canvasRef, zoom, pan, setZoom, setPan } = options;

  const handleViewportStateChange = useCallback(
    (state: CanvasViewportState) => {
      setZoom(state.zoom);
      setPan(state.pan);
    },
    [setZoom, setPan]
  );

  const { elementRefCallback } = useCanvasViewportBridge({
    viewport,
    elementRef: canvasRef,
    externalState: { zoom, pan },
    onViewportStateChange: handleViewportStateChange,
  });

  return {
    canvasRefCallback: elementRefCallback,
  };
}
