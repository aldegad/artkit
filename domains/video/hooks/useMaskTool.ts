"use client";

import { useCallback, useRef } from "react";
import { useMask } from "../contexts/MaskContext";
import { Point } from "@/shared/types";
import { drawDab as sharedDrawDab, drawLine as sharedDrawLine } from "@/shared/utils/brushEngine";

interface UseMaskToolReturn {
  // Drawing
  startDraw: (x: number, y: number) => void;
  continueDraw: (x: number, y: number) => void;
  endDraw: () => void;

  // Get current mask as data URL
  getMaskDataUrl: () => string | null;

  // Apply mask from data URL
  applyMaskData: (dataUrl: string) => void;

  // Clear mask
  clearMask: () => void;
  fillMask: () => void;
}

export function useMaskTool(): UseMaskToolReturn {
  const { brushSettings, maskCanvasRef, isEditingMask } = useMask();
  const lastPointRef = useRef<Point | null>(null);
  const isDrawingRef = useRef(false);

  // Draw a single dab using shared brush engine
  const drawMaskDab = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      const { size, hardness, opacity, mode } = brushSettings;
      const isEraser = mode === "erase";

      ctx.save();
      if (isEraser) {
        ctx.globalCompositeOperation = "destination-out";
      }

      sharedDrawDab(ctx, {
        x,
        y,
        radius: size / 2,
        hardness: hardness / 100,
        color: "#ffffff",
        alpha: opacity / 100,
        isEraser,
      });

      ctx.restore();
    },
    [brushSettings]
  );

  // Draw a line of dabs using shared brush engine
  const drawMaskLine = useCallback(
    (ctx: CanvasRenderingContext2D, from: Point, to: Point) => {
      const { size, hardness, opacity, mode } = brushSettings;
      const isEraser = mode === "erase";

      ctx.save();
      if (isEraser) {
        ctx.globalCompositeOperation = "destination-out";
      }

      sharedDrawLine(ctx, {
        from,
        to,
        spacing: Math.max(1, size * 0.1),
        dab: {
          radius: size / 2,
          hardness: hardness / 100,
          color: "#ffffff",
          alpha: opacity / 100,
          isEraser,
        },
      });

      ctx.restore();
    },
    [brushSettings]
  );

  // Start drawing
  const startDraw = useCallback(
    (x: number, y: number) => {
      if (!isEditingMask || !maskCanvasRef.current) return;

      const ctx = maskCanvasRef.current.getContext("2d");
      if (!ctx) return;

      isDrawingRef.current = true;
      lastPointRef.current = { x, y };
      drawMaskDab(ctx, x, y);
    },
    [isEditingMask, maskCanvasRef, drawMaskDab]
  );

  // Continue drawing
  const continueDraw = useCallback(
    (x: number, y: number) => {
      if (!isDrawingRef.current || !isEditingMask || !maskCanvasRef.current) return;

      const ctx = maskCanvasRef.current.getContext("2d");
      if (!ctx) return;

      if (lastPointRef.current) {
        drawMaskLine(ctx, lastPointRef.current, { x, y });
      } else {
        drawMaskDab(ctx, x, y);
      }

      lastPointRef.current = { x, y };
    },
    [isEditingMask, maskCanvasRef, drawMaskDab, drawMaskLine]
  );

  // End drawing
  const endDraw = useCallback(() => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  // Get mask as data URL
  const getMaskDataUrl = useCallback((): string | null => {
    if (!maskCanvasRef.current) return null;
    return maskCanvasRef.current.toDataURL("image/png");
  }, [maskCanvasRef]);

  // Apply mask from data URL
  const applyMaskData = useCallback(
    (dataUrl: string) => {
      if (!maskCanvasRef.current) return;

      const ctx = maskCanvasRef.current.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, maskCanvasRef.current!.width, maskCanvasRef.current!.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = dataUrl;
    },
    [maskCanvasRef]
  );

  // Clear mask (fully transparent = clip invisible)
  const clearMask = useCallback(() => {
    if (!maskCanvasRef.current) return;

    const ctx = maskCanvasRef.current.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
  }, [maskCanvasRef]);

  // Fill mask (all white = fully visible)
  const fillMask = useCallback(() => {
    if (!maskCanvasRef.current) return;

    const ctx = maskCanvasRef.current.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
  }, [maskCanvasRef]);

  return {
    startDraw,
    continueDraw,
    endDraw,
    getMaskDataUrl,
    applyMaskData,
    clearMask,
    fillMask,
  };
}
