"use client";

import { useCallback, useRef } from "react";
import { useMask } from "../contexts/MaskContext";
import { Point } from "@/shared/types";
import { drawDab as sharedDrawDab, drawLine as sharedDrawLine } from "@/shared/utils/brushEngine";
import { calculateDrawingParameters } from "@/domains/image/constants/brushPresets";

interface UseMaskToolReturn {
  // Drawing
  startDraw: (x: number, y: number, pressure?: number) => void;
  continueDraw: (x: number, y: number, pressure?: number) => void;
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
  const { brushSettings, activePreset, pressureEnabled, maskCanvasRef, isEditingMask } = useMask();
  const lastPointRef = useRef<Point | null>(null);
  const isDrawingRef = useRef(false);

  const normalizePressure = (pressure: number): number =>
    Number.isFinite(pressure) ? Math.max(0.01, Math.min(1, pressure)) : 1;

  // Draw a single dab using shared brush engine
  const drawMaskDab = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, pressure: number = 1) => {
      const { size, hardness, opacity, mode } = brushSettings;
      const isEraser = mode === "erase";
      const params = calculateDrawingParameters(
        normalizePressure(pressure),
        activePreset,
        size,
        pressureEnabled,
      );

      ctx.save();
      if (isEraser) {
        ctx.globalCompositeOperation = "destination-out";
      }

      sharedDrawDab(ctx, {
        x,
        y,
        radius: params.size / 2,
        hardness: hardness / 100,
        color: "#ffffff",
        alpha: (opacity / 100) * params.opacity * params.flow,
        isEraser,
      });

      ctx.restore();
    },
    [brushSettings, activePreset, pressureEnabled]
  );

  // Draw a line of dabs using shared brush engine
  const drawMaskLine = useCallback(
    (ctx: CanvasRenderingContext2D, from: Point, to: Point, pressure: number = 1) => {
      const { size, hardness, opacity, mode } = brushSettings;
      const isEraser = mode === "erase";
      const params = calculateDrawingParameters(
        normalizePressure(pressure),
        activePreset,
        size,
        pressureEnabled,
      );

      ctx.save();
      if (isEraser) {
        ctx.globalCompositeOperation = "destination-out";
      }

      sharedDrawLine(ctx, {
        from,
        to,
        spacing: Math.max(1, params.size * (activePreset.spacing / 100)),
        dab: {
          radius: params.size / 2,
          hardness: hardness / 100,
          color: "#ffffff",
          alpha: (opacity / 100) * params.opacity * params.flow,
          isEraser,
        },
      });

      ctx.restore();
    },
    [brushSettings, activePreset, pressureEnabled]
  );

  // Start drawing
  const startDraw = useCallback(
    (x: number, y: number, pressure: number = 1) => {
      if (!isEditingMask || !maskCanvasRef.current) return;

      const ctx = maskCanvasRef.current.getContext("2d");
      if (!ctx) return;

      isDrawingRef.current = true;
      lastPointRef.current = { x, y };
      drawMaskDab(ctx, x, y, pressure);
    },
    [isEditingMask, maskCanvasRef, drawMaskDab]
  );

  // Continue drawing
  const continueDraw = useCallback(
    (x: number, y: number, pressure: number = 1) => {
      if (!isDrawingRef.current || !isEditingMask || !maskCanvasRef.current) return;

      const ctx = maskCanvasRef.current.getContext("2d");
      if (!ctx) return;

      if (lastPointRef.current) {
        drawMaskLine(ctx, lastPointRef.current, { x, y }, pressure);
      } else {
        drawMaskDab(ctx, x, y, pressure);
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
