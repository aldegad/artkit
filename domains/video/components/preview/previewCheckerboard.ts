import type { MutableRefObject } from "react";
import { getCanvasColorsSync } from "@/shared/hooks";
import { PREVIEW } from "../../constants";

interface CheckerboardPatternCache {
  patternRef: MutableRefObject<CanvasPattern | null>;
  patternKeyRef: MutableRefObject<string>;
  patternCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
}

interface DrawPreviewCheckerboardOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  isDraftMode: boolean;
  cache: CheckerboardPatternCache;
}

export function drawPreviewCheckerboard({
  ctx,
  width,
  height,
  isDraftMode,
  cache,
}: DrawPreviewCheckerboardOptions): void {
  const size = isDraftMode ? PREVIEW.CHECKERBOARD_SIZE * 2 : PREVIEW.CHECKERBOARD_SIZE;
  const colors = getCanvasColorsSync();
  const patternKey = `${size}:${colors.checkerboardLight}:${colors.checkerboardDark}`;

  if (cache.patternKeyRef.current !== patternKey || !cache.patternRef.current) {
    const tileCanvas = cache.patternCanvasRef.current ?? document.createElement("canvas");
    cache.patternCanvasRef.current = tileCanvas;
    tileCanvas.width = size * 2;
    tileCanvas.height = size * 2;

    const tileCtx = tileCanvas.getContext("2d");
    if (!tileCtx) return;

    tileCtx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
    tileCtx.fillStyle = colors.checkerboardLight;
    tileCtx.fillRect(0, 0, tileCanvas.width, tileCanvas.height);
    tileCtx.fillStyle = colors.checkerboardDark;
    tileCtx.fillRect(0, 0, size, size);
    tileCtx.fillRect(size, size, size, size);

    cache.patternRef.current = ctx.createPattern(tileCanvas, "repeat");
    cache.patternKeyRef.current = patternKey;
  }

  if (!cache.patternRef.current) return;
  ctx.fillStyle = cache.patternRef.current;
  ctx.fillRect(0, 0, width, height);
}
