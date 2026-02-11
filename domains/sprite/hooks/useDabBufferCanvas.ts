import { useCallback, useRef } from "react";
import type { DabBufferCanvas } from "../utils/brushDrawing";

export function useDabBufferCanvas() {
  const dabBufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dabBufferCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const ensureDabBufferCanvas = useCallback((width: number, height: number): DabBufferCanvas | null => {
    if (
      !dabBufferCanvasRef.current
      || dabBufferCanvasRef.current.width !== width
      || dabBufferCanvasRef.current.height !== height
      || !dabBufferCtxRef.current
    ) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return null;
      }
      ctx.imageSmoothingEnabled = false;
      dabBufferCanvasRef.current = canvas;
      dabBufferCtxRef.current = ctx;
    }

    return {
      canvas: dabBufferCanvasRef.current,
      ctx: dabBufferCtxRef.current,
    };
  }, []);

  const resetDabBufferCanvas = useCallback(() => {
    dabBufferCanvasRef.current = null;
    dabBufferCtxRef.current = null;
  }, []);

  return {
    ensureDabBufferCanvas,
    resetDabBufferCanvas,
  };
}
