// ============================================
// Pan/Zoom Handler
// ============================================

import { useCallback } from "react";
import { Point } from "../../types";
import type { MouseEventContext, HandlerResult, PanZoomHandlerOptions } from "./types";

export interface UsePanZoomHandlerReturn {
  handleMouseDown: (ctx: MouseEventContext) => HandlerResult;
  handleMouseMove: (ctx: MouseEventContext, dragStart: Point) => void;
}

export function usePanZoomHandler(options: PanZoomHandlerOptions): UsePanZoomHandlerReturn {
  const { canvasRef, zoom, setZoom, setPan } = options;

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

        const zoomFactor = e.altKey ? 0.8 : 1.25;
        const newZoom = Math.max(0.1, Math.min(10, zoom * zoomFactor));
        const scale = newZoom / zoom;

        // Zoom centered on cursor position
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        setPan((p) => ({
          x: p.x * scale + (1 - scale) * (screenPos.x - centerX),
          y: p.y * scale + (1 - scale) * (screenPos.y - centerY),
        }));
        setZoom(newZoom);

        return { handled: true };
      }

      return { handled: false };
    },
    [canvasRef, zoom, setZoom, setPan]
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
