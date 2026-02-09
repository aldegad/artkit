"use client";

import { useCallback, useEffect, useRef } from "react";
import { Point } from "../types";

interface ViewportBridgeLike {
  onViewportChange: (callback: (state: { zoom: number; pan: Point }) => void) => () => void;
  updateTransform: (partial: { zoom: number; pan: Point }) => void;
  wheelRef: (el: HTMLElement | null) => void;
  pinchRef: (el: HTMLElement | null) => void;
}

interface UseViewportBridgeOptions {
  viewport: ViewportBridgeLike;
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
  const lastViewportSyncRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });

  useEffect(() => {
    return viewport.onViewportChange((state) => {
      lastViewportSyncRef.current = { zoom: state.zoom, pan: { ...state.pan } };
      setZoom(state.zoom);
      setPan(state.pan);
    });
  }, [viewport, setZoom, setPan]);

  useEffect(() => {
    const last = lastViewportSyncRef.current;
    if (zoom === last.zoom && pan.x === last.pan.x && pan.y === last.pan.y) return;
    lastViewportSyncRef.current = { zoom, pan: { ...pan } };
    viewport.updateTransform({ zoom, pan });
  }, [zoom, pan, viewport]);

  const canvasRefCallback = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      canvasRef.current = canvas;
      viewport.wheelRef(canvas);
      viewport.pinchRef(canvas);
    },
    [canvasRef, viewport]
  );

  return {
    canvasRefCallback,
  };
}
