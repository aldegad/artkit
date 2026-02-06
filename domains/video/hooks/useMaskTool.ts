"use client";

import { useCallback, useRef } from "react";
import { useMask } from "../contexts/MaskContext";
import { Point } from "@/shared/types";

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

  // Draw a soft brush dab
  const drawDab = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      const { size, hardness, opacity, mode } = brushSettings;
      const radius = size / 2;

      ctx.save();

      if (mode === "paint") {
        // Paint mode: add white (visible)
        if (hardness >= 99) {
          ctx.globalAlpha = opacity / 100;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Soft brush with gradient
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
          const hardnessRatio = hardness / 100;
          gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity / 100})`);
          gradient.addColorStop(hardnessRatio, `rgba(255, 255, 255, ${opacity / 100})`);
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Erase mode: add black (transparent)
        ctx.globalCompositeOperation = "destination-out";
        if (hardness >= 99) {
          ctx.globalAlpha = opacity / 100;
          ctx.fillStyle = "#000000";
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
          const hardnessRatio = hardness / 100;
          gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity / 100})`);
          gradient.addColorStop(hardnessRatio, `rgba(0, 0, 0, ${opacity / 100})`);
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    },
    [brushSettings]
  );

  // Draw a line of dabs between two points
  const drawLine = useCallback(
    (ctx: CanvasRenderingContext2D, from: Point, to: Point) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const spacing = Math.max(1, brushSettings.size * 0.1); // 10% of brush size
      const steps = Math.ceil(distance / spacing);

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + dx * t;
        const y = from.y + dy * t;
        drawDab(ctx, x, y);
      }
    },
    [brushSettings.size, drawDab]
  );

  // Start drawing
  const startDraw = useCallback(
    (x: number, y: number) => {
      if (!isEditingMask || !maskCanvasRef.current) return;

      const ctx = maskCanvasRef.current.getContext("2d");
      if (!ctx) return;

      isDrawingRef.current = true;
      lastPointRef.current = { x, y };
      drawDab(ctx, x, y);
    },
    [isEditingMask, maskCanvasRef, drawDab]
  );

  // Continue drawing
  const continueDraw = useCallback(
    (x: number, y: number) => {
      if (!isDrawingRef.current || !isEditingMask || !maskCanvasRef.current) return;

      const ctx = maskCanvasRef.current.getContext("2d");
      if (!ctx) return;

      if (lastPointRef.current) {
        drawLine(ctx, lastPointRef.current, { x, y });
      } else {
        drawDab(ctx, x, y);
      }

      lastPointRef.current = { x, y };
    },
    [isEditingMask, maskCanvasRef, drawDab, drawLine]
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
