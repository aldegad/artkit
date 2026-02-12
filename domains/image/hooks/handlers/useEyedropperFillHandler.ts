// ============================================
// Eyedropper & Fill Handler
// ============================================

import { useCallback, RefObject } from "react";
import { Point } from "../../types";
import type { MouseEventContext, HandlerResult, BaseHandlerOptions } from "./types";

export interface EyedropperFillHandlerOptions extends BaseHandlerOptions {
  pickColor: (
    x: number,
    y: number,
    canvasRef: RefObject<HTMLCanvasElement | null>,
    zoom: number,
    pan: Point
  ) => void;
  fillWithColor: () => void;
  applyMagicWandSelection: (x: number, y: number) => void;
}

export interface UseEyedropperFillHandlerReturn {
  handleMouseDown: (ctx: MouseEventContext) => HandlerResult;
}

export function useEyedropperFillHandler(options: EyedropperFillHandlerOptions): UseEyedropperFillHandlerReturn {
  const { canvasRef, zoom, pan, pickColor, fillWithColor, applyMagicWandSelection } = options;

  const handleMouseDown = useCallback(
    (ctx: MouseEventContext): HandlerResult => {
      const { imagePos, activeMode, inBounds } = ctx;

      // Eyedropper tool
      if (activeMode === "eyedropper" && inBounds) {
        pickColor(imagePos.x, imagePos.y, canvasRef, zoom, pan);
        return { handled: true };
      }

      // Fill tool
      if (activeMode === "fill" && inBounds) {
        fillWithColor();
        return { handled: true };
      }

      // Magic wand tool
      if (activeMode === "magicWand" && inBounds) {
        applyMagicWandSelection(imagePos.x, imagePos.y);
        return { handled: true };
      }

      return { handled: false };
    },
    [canvasRef, zoom, pan, pickColor, fillWithColor, applyMagicWandSelection]
  );

  return {
    handleMouseDown,
  };
}
