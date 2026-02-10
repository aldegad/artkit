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
  drawRectangle: (from: Point, to: Point, mode?: "paint" | "erase") => void;

  // Get current mask as data URL
  getMaskDataUrl: () => string | null;

  // Apply mask from data URL
  applyMaskData: (dataUrl: string) => void;

  // Clear mask
  clearMask: () => void;
  fillMask: () => void;
}

export function useMaskTool(): UseMaskToolReturn {
  const { brushSettings, activePreset, pressureEnabled, maskCanvasRef, isEditingMask, maskRegion } = useMask();
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

  const drawRectangle = useCallback((from: Point, to: Point, mode?: "paint" | "erase") => {
    if (!isEditingMask || !maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext("2d");
    if (!ctx) return;

    const left = Math.min(from.x, to.x);
    const top = Math.min(from.y, to.y);
    const width = Math.max(1, Math.abs(to.x - from.x));
    const height = Math.max(1, Math.abs(to.y - from.y));
    const drawMode = mode ?? brushSettings.mode;
    const opacity = Math.max(0, Math.min(1, brushSettings.opacity / 100));
    const hardness01 = Math.max(0, Math.min(1, brushSettings.hardness / 100));
    const edgeSoftnessFromHardness = (1 - hardness01) * (brushSettings.size / 2);
    const edgeSoftnessFromFeather = Math.max(0, brushSettings.feather);
    const edgeSoftness = Math.min(
      Math.max(edgeSoftnessFromHardness, edgeSoftnessFromFeather),
      Math.min(width, height) / 2
    );
    const rectWidth = Math.max(1, Math.ceil(width));
    const rectHeight = Math.max(1, Math.ceil(height));
    const rectX = Math.round(left);
    const rectY = Math.round(top);
    const edge = Math.max(0, Math.min(edgeSoftness, Math.min(rectWidth, rectHeight) / 2));

    ctx.save();
    if (drawMode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
    }
    ctx.globalAlpha = opacity;

    if (edge <= 0.5) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
      ctx.restore();
      return;
    }

    const shapeCanvas = document.createElement("canvas");
    shapeCanvas.width = rectWidth;
    shapeCanvas.height = rectHeight;
    const shapeCtx = shapeCanvas.getContext("2d");
    if (!shapeCtx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
      ctx.restore();
      return;
    }

    const innerX = edge;
    const innerY = edge;
    const innerW = Math.max(0, rectWidth - edge * 2);
    const innerH = Math.max(0, rectHeight - edge * 2);

    shapeCtx.fillStyle = "#ffffff";
    if (innerW > 0 && innerH > 0) {
      shapeCtx.fillRect(innerX, innerY, innerW, innerH);
    }

    if (innerW > 0) {
      const topGradient = shapeCtx.createLinearGradient(0, 0, 0, edge);
      topGradient.addColorStop(0, "rgba(255,255,255,0)");
      topGradient.addColorStop(1, "rgba(255,255,255,1)");
      shapeCtx.fillStyle = topGradient;
      shapeCtx.fillRect(innerX, 0, innerW, edge);

      const bottomGradient = shapeCtx.createLinearGradient(0, rectHeight - edge, 0, rectHeight);
      bottomGradient.addColorStop(0, "rgba(255,255,255,1)");
      bottomGradient.addColorStop(1, "rgba(255,255,255,0)");
      shapeCtx.fillStyle = bottomGradient;
      shapeCtx.fillRect(innerX, rectHeight - edge, innerW, edge);
    }

    if (innerH > 0) {
      const leftGradient = shapeCtx.createLinearGradient(0, 0, edge, 0);
      leftGradient.addColorStop(0, "rgba(255,255,255,0)");
      leftGradient.addColorStop(1, "rgba(255,255,255,1)");
      shapeCtx.fillStyle = leftGradient;
      shapeCtx.fillRect(0, innerY, edge, innerH);

      const rightGradient = shapeCtx.createLinearGradient(rectWidth - edge, 0, rectWidth, 0);
      rightGradient.addColorStop(0, "rgba(255,255,255,1)");
      rightGradient.addColorStop(1, "rgba(255,255,255,0)");
      shapeCtx.fillStyle = rightGradient;
      shapeCtx.fillRect(rectWidth - edge, innerY, edge, innerH);
    }

    const drawCorner = (cx: number, cy: number, x: number, y: number) => {
      const cornerGradient = shapeCtx.createRadialGradient(cx, cy, 0, cx, cy, edge);
      cornerGradient.addColorStop(0, "rgba(255,255,255,1)");
      cornerGradient.addColorStop(1, "rgba(255,255,255,0)");
      shapeCtx.fillStyle = cornerGradient;
      shapeCtx.fillRect(x, y, edge, edge);
    };
    drawCorner(edge, edge, 0, 0);
    drawCorner(rectWidth - edge, edge, rectWidth - edge, 0);
    drawCorner(edge, rectHeight - edge, 0, rectHeight - edge);
    drawCorner(rectWidth - edge, rectHeight - edge, rectWidth - edge, rectHeight - edge);

    ctx.drawImage(shapeCanvas, rectX, rectY);
    ctx.restore();
  }, [isEditingMask, maskCanvasRef, brushSettings.mode, brushSettings.opacity, brushSettings.hardness, brushSettings.size, brushSettings.feather]);

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
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    if (width <= 0 || height <= 0) return;

    if (maskRegion && maskRegion.width > 0 && maskRegion.height > 0) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const rx = Math.round(Math.max(0, Math.min(maskRegion.x, width)));
      const ry = Math.round(Math.max(0, Math.min(maskRegion.y, height)));
      const rw = Math.round(Math.max(1, Math.min(maskRegion.width, width - rx)));
      const rh = Math.round(Math.max(1, Math.min(maskRegion.height, height - ry)));
      if (rw <= 0 || rh <= 0) return;

      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();
      ctx.clearRect(rx, ry, rw, rh);
      ctx.restore();
      return;
    }

    // Reset the canvas context to clear any lingering clip region.
    canvas.width = width;
    canvas.height = height;
  }, [maskCanvasRef, maskRegion]);

  // Fill mask (all white = fully visible)
  const fillMask = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    if (width <= 0 || height <= 0) return;

    if (maskRegion && maskRegion.width > 0 && maskRegion.height > 0) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const rx = Math.round(Math.max(0, Math.min(maskRegion.x, width)));
      const ry = Math.round(Math.max(0, Math.min(maskRegion.y, height)));
      const rw = Math.round(Math.max(1, Math.min(maskRegion.width, width - rx)));
      const rh = Math.round(Math.max(1, Math.min(maskRegion.height, height - ry)));
      if (rw <= 0 || rh <= 0) return;

      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.restore();
      return;
    }

    // Reset the canvas context so fill always applies to the full mask.
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }, [maskCanvasRef, maskRegion]);

  return {
    startDraw,
    continueDraw,
    endDraw,
    drawRectangle,
    getMaskDataUrl,
    applyMaskData,
    clearMask,
    fillMask,
  };
}
