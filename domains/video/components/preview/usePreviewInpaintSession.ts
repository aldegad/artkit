"use client";

import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  drawDab as drawBrushDab,
  drawLine as drawBrushLine,
  eraseDabLinear,
  eraseLineLinear,
  resetEraseAlphaCarry,
  resetPaintAlphaCarry,
} from "@/shared/utils/brushEngine";
import {
  INPAINT_BRUSH_HARDNESS,
  INPAINT_BRUSH_SIZE,
  INPAINT_STROKE_SPACING,
  InpaintBrushMode,
} from "./previewCanvasConfig";

interface UsePreviewInpaintSessionParams {
  isInpaintMode: boolean;
  projectSize: { width: number; height: number };
  inpaintMaskCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  screenToProject: (clientX: number, clientY: number, clamp?: boolean) => { x: number; y: number } | null;
  clampToCanvas: (point: { x: number; y: number }) => { x: number; y: number };
  scheduleRender: () => void;
}

export function usePreviewInpaintSession(params: UsePreviewInpaintSessionParams) {
  const {
    isInpaintMode,
    projectSize,
    inpaintMaskCanvasRef,
    screenToProject,
    clampToCanvas,
    scheduleRender,
  } = params;
  const [inpaintBrushMode, setInpaintBrushMode] = useState<InpaintBrushMode>("paint");
  const inpaintStrokeActiveRef = useRef(false);
  const inpaintLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const inpaintStrokeModeRef = useRef<InpaintBrushMode>("paint");

  const ensureInpaintMaskCanvas = useCallback((): HTMLCanvasElement | null => {
    const targetWidth = Math.max(1, Math.floor(projectSize.width));
    const targetHeight = Math.max(1, Math.floor(projectSize.height));
    if (targetWidth <= 0 || targetHeight <= 0) return null;

    let canvas = inpaintMaskCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      inpaintMaskCanvasRef.current = canvas;
      return canvas;
    }

    if (canvas.width === targetWidth && canvas.height === targetHeight) {
      return canvas;
    }

    const resized = document.createElement("canvas");
    resized.width = targetWidth;
    resized.height = targetHeight;
    const resizedCtx = resized.getContext("2d");
    if (resizedCtx) {
      resizedCtx.clearRect(0, 0, targetWidth, targetHeight);
      resizedCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
    }
    inpaintMaskCanvasRef.current = resized;
    return resized;
  }, [inpaintMaskCanvasRef, projectSize.height, projectSize.width]);

  useEffect(() => {
    ensureInpaintMaskCanvas();
  }, [ensureInpaintMaskCanvas]);

  const getInpaintPointFromClient = useCallback((clientX: number, clientY: number) => {
    const projectPoint = screenToProject(clientX, clientY, true);
    if (!projectPoint) return null;
    return clampToCanvas(projectPoint);
  }, [screenToProject, clampToCanvas]);

  const drawInpaintDab = useCallback((
    ctx: CanvasRenderingContext2D,
    point: { x: number; y: number },
    mode: InpaintBrushMode
  ) => {
    const radius = INPAINT_BRUSH_SIZE / 2;
    const hardness = INPAINT_BRUSH_HARDNESS / 100;
    if (mode === "erase") {
      eraseDabLinear(ctx, { x: point.x, y: point.y, radius, hardness, alpha: 1 });
      return;
    }

    drawBrushDab(ctx, {
      x: point.x,
      y: point.y,
      radius,
      hardness,
      color: "#ffffff",
      alpha: 1,
      isEraser: false,
    });
  }, []);

  const drawInpaintLine = useCallback((
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    mode: InpaintBrushMode
  ) => {
    const radius = INPAINT_BRUSH_SIZE / 2;
    const hardness = INPAINT_BRUSH_HARDNESS / 100;
    if (mode === "erase") {
      eraseLineLinear(ctx, {
        from,
        to,
        spacing: INPAINT_STROKE_SPACING,
        dab: { radius, hardness, alpha: 1 },
      });
      return;
    }

    drawBrushLine(ctx, {
      from,
      to,
      spacing: INPAINT_STROKE_SPACING,
      dab: { radius, hardness, color: "#ffffff", alpha: 1, isEraser: false },
    });
  }, []);

  const handleInpaintPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (!isInpaintMode || e.button !== 0) return false;
    const point = getInpaintPointFromClient(e.clientX, e.clientY);
    if (!point) return false;

    const canvas = ensureInpaintMaskCanvas();
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return false;

    const mode: InpaintBrushMode = e.altKey ? "erase" : "paint";
    inpaintStrokeModeRef.current = mode;
    setInpaintBrushMode(mode);
    inpaintStrokeActiveRef.current = true;
    inpaintLastPointRef.current = point;

    if (mode === "erase") {
      resetEraseAlphaCarry(ctx);
    } else {
      resetPaintAlphaCarry(ctx);
    }
    drawInpaintDab(ctx, point, mode);
    scheduleRender();
    return true;
  }, [drawInpaintDab, ensureInpaintMaskCanvas, getInpaintPointFromClient, isInpaintMode, scheduleRender]);

  const handleInpaintPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (!isInpaintMode) return false;

    const mode: InpaintBrushMode = e.altKey ? "erase" : "paint";
    setInpaintBrushMode((prev) => (prev === mode ? prev : mode));

    if (!inpaintStrokeActiveRef.current) {
      return false;
    }

    const point = getInpaintPointFromClient(e.clientX, e.clientY);
    if (!point) return true;

    const canvas = ensureInpaintMaskCanvas();
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return true;

    const strokeMode = inpaintStrokeModeRef.current;
    if (inpaintLastPointRef.current) {
      drawInpaintLine(ctx, inpaintLastPointRef.current, point, strokeMode);
    } else {
      drawInpaintDab(ctx, point, strokeMode);
    }
    inpaintLastPointRef.current = point;
    scheduleRender();
    return true;
  }, [drawInpaintDab, drawInpaintLine, ensureInpaintMaskCanvas, getInpaintPointFromClient, isInpaintMode, scheduleRender]);

  const stopInpaintStroke = useCallback(() => {
    inpaintStrokeActiveRef.current = false;
    inpaintLastPointRef.current = null;
  }, []);

  return {
    ensureInpaintMaskCanvas,
    handleInpaintPointerDown,
    handleInpaintPointerMove,
    stopInpaintStroke,
    inpaintBrushMode,
    inpaintBrushSize: INPAINT_BRUSH_SIZE,
    inpaintBrushHardness: INPAINT_BRUSH_HARDNESS,
  };
}
