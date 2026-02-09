// ============================================
// Pan/Zoom Handler
// ============================================

import { useCallback } from "react";
import { Point } from "../../types";
import { VIEWPORT } from "../../constants";
import { clampZoom, zoomAtPoint } from "@/shared/utils";
import type { MouseEventContext, HandlerResult, PanZoomHandlerOptions } from "./types";

export interface UsePanZoomHandlerReturn {
  handleMouseDown: (ctx: MouseEventContext) => HandlerResult;
  handleMouseMove: (ctx: MouseEventContext, dragStart: Point) => void;
}

export function usePanZoomHandler(options: PanZoomHandlerOptions): UsePanZoomHandlerReturn {
  const { canvasRef, zoom, pan, setZoom, setPan } = options;

  const handleMouseDown = useCallback(
    (ctx: MouseEventContext): HandlerResult => {
      const { screenPos, activeMode, e } = ctx;

      // Hand tool (pan)
      if (activeMode === "hand") {
        return {
          handled: true,
          dragType: "pan",
          dragStart: screenPos,
        };
      }

      // Zoom tool
      if (activeMode === "zoom") {
        const canvas = canvasRef.current;
        if (!canvas) return { handled: false };

        const zoomFactor = e.altKey ? VIEWPORT.ZOOM_STEP_OUT : VIEWPORT.ZOOM_STEP_IN;
        const newZoom = clampZoom(
          zoom * zoomFactor,
          VIEWPORT.MIN_ZOOM,
          VIEWPORT.MAX_ZOOM
        );

        const result = zoomAtPoint(
          screenPos,
          { zoom, pan, baseScale: 1 },
          newZoom,
          "center",
          { width: canvas.width, height: canvas.height }
        );

        setPan(result.pan);
        setZoom(result.zoom);

        return { handled: true };
      }

      return { handled: false };
    },
    [canvasRef, zoom, pan, setZoom, setPan]
  );

  const handleMouseMove = useCallback(
    (ctx: MouseEventContext, dragStart: Point) => {
      const { screenPos } = ctx;
      const dx = screenPos.x - dragStart.x;
      const dy = screenPos.y - dragStart.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    },
    [setPan]
  );

  return {
    handleMouseDown,
    handleMouseMove,
  };
}
