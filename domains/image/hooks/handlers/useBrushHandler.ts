// ============================================
// Brush/Eraser/Stamp Handler
// ============================================

import { useCallback } from "react";
import type { MouseEventContext, HandlerResult, BrushHandlerOptions } from "./types";
import { showInfoToast } from "@/shared/components";

export interface UseBrushHandlerReturn {
  handleMouseDown: (ctx: MouseEventContext) => HandlerResult;
  handleMouseMove: (ctx: MouseEventContext) => void;
}

export function useBrushHandler(options: BrushHandlerOptions): UseBrushHandlerReturn {
  const { activeLayerPosition, drawOnEditCanvas, resetLastDrawPoint, stampSource, setStampSource, saveToHistory } =
    options;

  const handleMouseDown = useCallback(
    (ctx: MouseEventContext): HandlerResult => {
      const { imagePos, activeMode, inBounds, e } = ctx;

      // Stamp tool
      if (activeMode === "stamp") {
        if (e.altKey && inBounds) {
          setStampSource({ x: imagePos.x, y: imagePos.y });
          return { handled: true };
        }

        if (!stampSource) {
          showInfoToast("Alt+클릭으로 복제 소스를 먼저 지정하세요");
          return { handled: true };
        }

        if (inBounds) {
          saveToHistory();
          resetLastDrawPoint();
          const pressure = "pressure" in e ? (e.pressure as number) || 1 : 1;
          // Convert from image coordinates to layer-local coordinates
          const layerX = imagePos.x - (activeLayerPosition?.x || 0);
          const layerY = imagePos.y - (activeLayerPosition?.y || 0);
          drawOnEditCanvas(layerX, layerY, true, pressure);
          return {
            handled: true,
            dragType: "draw",
          };
        }
        return { handled: true };
      }

      // Brush/Eraser tool
      if ((activeMode === "brush" || activeMode === "eraser") && inBounds) {
        saveToHistory();
        resetLastDrawPoint();
        const pressure = "pressure" in e ? (e.pressure as number) || 1 : 1;
        // Convert from image coordinates to layer-local coordinates
        const layerX = imagePos.x - (activeLayerPosition?.x || 0);
        const layerY = imagePos.y - (activeLayerPosition?.y || 0);
        drawOnEditCanvas(layerX, layerY, true, pressure);
        return {
          handled: true,
          dragType: "draw",
        };
      }

      return { handled: false };
    },
    [activeLayerPosition, drawOnEditCanvas, resetLastDrawPoint, stampSource, setStampSource, saveToHistory]
  );

  const handleMouseMove = useCallback(
    (ctx: MouseEventContext) => {
      const { imagePos, e, displayDimensions } = ctx;
      const { width: displayWidth, height: displayHeight } = displayDimensions;

      const clampedX = Math.max(0, Math.min(imagePos.x, displayWidth));
      const clampedY = Math.max(0, Math.min(imagePos.y, displayHeight));
      const pressure = "pressure" in e ? (e.pressure as number) || 1 : 1;
      // Convert from image coordinates to layer-local coordinates
      const layerX = clampedX - (activeLayerPosition?.x || 0);
      const layerY = clampedY - (activeLayerPosition?.y || 0);
      drawOnEditCanvas(layerX, layerY, false, pressure);
    },
    [activeLayerPosition, drawOnEditCanvas]
  );

  return {
    handleMouseDown,
    handleMouseMove,
  };
}
