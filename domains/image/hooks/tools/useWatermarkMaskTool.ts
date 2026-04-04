"use client";

import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

type WatermarkBrushMode = "brush" | "eraser";

interface UseWatermarkMaskToolReturn {
  maskCanvasRef: RefObject<HTMLCanvasElement | null>;
  wmBrushSize: number;
  setWmBrushSize: Dispatch<SetStateAction<number>>;
  wmBrushMode: WatermarkBrushMode;
  setWmBrushMode: Dispatch<SetStateAction<WatermarkBrushMode>>;
  hasMask: boolean;
  maskVersion: number;
  drawMask: (layerLocalX: number, layerLocalY: number, isStart?: boolean) => void;
  resetLastMaskPoint: () => void;
  initMask: (width: number, height: number) => void;
  clearMask: () => void;
  hasMaskContent: () => boolean;
}

interface MaskPoint {
  x: number;
  y: number;
}

const DEFAULT_WATERMARK_BRUSH_SIZE = 20;

export function useWatermarkMaskTool(): UseWatermarkMaskToolReturn {
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastMaskPointRef = useRef<MaskPoint | null>(null);
  const [wmBrushSize, setWmBrushSize] = useState(DEFAULT_WATERMARK_BRUSH_SIZE);
  const [wmBrushMode, setWmBrushMode] = useState<WatermarkBrushMode>("brush");
  const [hasMask, setHasMask] = useState(false);
  const [maskVersion, setMaskVersion] = useState(0);

  const bumpMaskVersion = useCallback(() => {
    setMaskVersion((prev) => prev + 1);
  }, []);

  const hasMaskContent = useCallback((): boolean => {
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) {
      return false;
    }

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) {
        return true;
      }
    }
    return false;
  }, []);

  const resetLastMaskPoint = useCallback(() => {
    lastMaskPointRef.current = null;
    // Eraser 스트로크 완료 시에만 전체 픽셀 스캔 (mousemove마다 하면 성능 문제)
    if (wmBrushMode === "eraser") {
      setHasMask(hasMaskContent());
    }
  }, [wmBrushMode, hasMaskContent]);

  const drawMaskCircle = useCallback((
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
  ) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const drawMaskLine = useCallback((
    ctx: CanvasRenderingContext2D,
    from: MaskPoint,
    to: MaskPoint,
    radius: number,
  ) => {
    let x0 = Math.round(from.x);
    let y0 = Math.round(from.y);
    const x1 = Math.round(to.x);
    const y1 = Math.round(to.y);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      drawMaskCircle(ctx, x0, y0, radius);
      if (x0 === x1 && y0 === y1) break;
      const err2 = err * 2;
      if (err2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (err2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }, [drawMaskCircle]);

  const initMask = useCallback((width: number, height: number) => {
    if (typeof document === "undefined") return;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    maskCanvasRef.current = canvas;
    lastMaskPointRef.current = null;
    setHasMask(false);
    bumpMaskVersion();
  }, [bumpMaskVersion]);

  const clearMask = useCallback(() => {
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    lastMaskPointRef.current = null;
    setHasMask(false);
    bumpMaskVersion();
  }, [bumpMaskVersion]);

  const drawMask = useCallback((layerLocalX: number, layerLocalY: number, isStart: boolean = false) => {
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const radius = Math.max(0.5, wmBrushSize / 2);
    const edgeMargin = Math.max(1, radius);
    const x = Math.max(-edgeMargin, Math.min(layerLocalX, canvas.width + edgeMargin));
    const y = Math.max(-edgeMargin, Math.min(layerLocalY, canvas.height + edgeMargin));

    ctx.save();
    if (wmBrushMode === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(255,255,255,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(255,255,255,1)";
    }

    if (isStart || !lastMaskPointRef.current) {
      drawMaskCircle(ctx, x, y, radius);
    } else {
      drawMaskLine(ctx, lastMaskPointRef.current, { x, y }, radius);
    }
    ctx.restore();

    lastMaskPointRef.current = { x, y };
    setHasMask(true);
    bumpMaskVersion();
  }, [bumpMaskVersion, drawMaskCircle, drawMaskLine, wmBrushMode, wmBrushSize]);

  return {
    maskCanvasRef,
    wmBrushSize,
    setWmBrushSize,
    wmBrushMode,
    setWmBrushMode,
    hasMask,
    maskVersion,
    drawMask,
    resetLastMaskPoint,
    initMask,
    clearMask,
    hasMaskContent,
  };
}
