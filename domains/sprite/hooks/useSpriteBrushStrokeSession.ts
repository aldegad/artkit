"use client";

import { useCallback, useRef, useState } from "react";
import { drawInterpolatedStroke } from "../utils/brushDrawing";
import { getPointerPressure } from "@/shared/utils";

interface StrokePoint {
  x: number;
  y: number;
}

interface UseSpriteBrushStrokeSessionParams {
  pushHistory: () => void;
  drawAt: (x: number, y: number, pressure: number, isStrokeStart: boolean) => boolean;
  requestRender: () => void;
  commitStroke: () => void;
}

interface UseSpriteBrushStrokeSessionResult {
  isDrawing: boolean;
  hasDrawn: boolean;
  resetHasDrawn: () => void;
  startBrushStroke: (e: React.PointerEvent<HTMLCanvasElement>, coords: StrokePoint) => void;
  continueBrushStroke: (e: React.PointerEvent<HTMLCanvasElement>, coords: StrokePoint) => void;
  endBrushStroke: (pointerId: number) => void;
  cancelBrushStroke: () => void;
}

export function useSpriteBrushStrokeSession({
  pushHistory,
  drawAt,
  requestRender,
  commitStroke,
}: UseSpriteBrushStrokeSessionParams): UseSpriteBrushStrokeSessionResult {
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const drawingPointerIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<StrokePoint>({ x: 0, y: 0 });

  const resetHasDrawn = useCallback(() => {
    setHasDrawn(false);
  }, []);

  const startBrushStroke = useCallback((e: React.PointerEvent<HTMLCanvasElement>, coords: StrokePoint) => {
    if (!hasDrawn) {
      pushHistory();
      setHasDrawn(true);
    }

    drawingPointerIdRef.current = e.pointerId;
    setIsDrawing(true);
    const pressure = getPointerPressure(e);
    if (drawAt(coords.x, coords.y, pressure, true)) {
      requestRender();
    }
    lastPointRef.current = { x: coords.x, y: coords.y };
  }, [drawAt, hasDrawn, pushHistory, requestRender]);

  const continueBrushStroke = useCallback((e: React.PointerEvent<HTMLCanvasElement>, coords: StrokePoint) => {
    if (!isDrawing || drawingPointerIdRef.current !== e.pointerId) return;
    const pressure = getPointerPressure(e);
    const didInterpolate = drawInterpolatedStroke({
      from: lastPointRef.current,
      to: coords,
      drawAt: (x, y) => {
        drawAt(x, y, pressure, false);
      },
    });
    if (didInterpolate) {
      requestRender();
    }
    lastPointRef.current = { x: coords.x, y: coords.y };
  }, [drawAt, isDrawing, requestRender]);

  const endBrushStroke = useCallback((pointerId: number): void => {
    if (drawingPointerIdRef.current !== pointerId) return;
    drawingPointerIdRef.current = null;
    setIsDrawing(false);
    commitStroke();
  }, [commitStroke]);

  const cancelBrushStroke = useCallback(() => {
    drawingPointerIdRef.current = null;
    setIsDrawing(false);
  }, []);

  return {
    isDrawing,
    hasDrawn,
    resetHasDrawn,
    startBrushStroke,
    continueBrushStroke,
    endBrushStroke,
    cancelBrushStroke,
  };
}
