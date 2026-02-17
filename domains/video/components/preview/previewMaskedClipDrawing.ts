import type { MutableRefObject } from "react";
import { drawScaledImage, type CanvasScaleMode } from "@/shared/utils";

interface SizeLike {
  width: number;
  height: number;
}

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DrawMaskedClipOptions {
  ctx: CanvasRenderingContext2D;
  sourceEl: CanvasImageSource;
  clipMaskSource: CanvasImageSource;
  clipProjectRect: RectLike;
  projectSize: SizeLike;
  previewRect: RectLike;
  clipOpacity: number;
  progressiveMinify: boolean;
  previewScaleMode: CanvasScaleMode;
  maskTempCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  maskOverlayCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  overlayTint: string | null;
}

function ensureReusableCanvas(
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  width: number,
  height: number,
): HTMLCanvasElement {
  if (!canvasRef.current) {
    canvasRef.current = document.createElement("canvas");
  }

  const canvas = canvasRef.current;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return canvas;
}

export function drawMaskedClipLayer({
  ctx,
  sourceEl,
  clipMaskSource,
  clipProjectRect,
  projectSize,
  previewRect,
  clipOpacity,
  progressiveMinify,
  previewScaleMode,
  maskTempCanvasRef,
  maskOverlayCanvasRef,
  overlayTint,
}: DrawMaskedClipOptions): void {
  const maskWidth = projectSize.width;
  const maskHeight = projectSize.height;
  const tmpCanvas = ensureReusableCanvas(maskTempCanvasRef, maskWidth, maskHeight);
  const tmpCtx = tmpCanvas.getContext("2d");
  if (!tmpCtx) return;

  tmpCtx.imageSmoothingEnabled = true;
  tmpCtx.imageSmoothingQuality = "high";
  tmpCtx.clearRect(0, 0, maskWidth, maskHeight);
  tmpCtx.globalCompositeOperation = "source-over";
  tmpCtx.globalAlpha = 1;
  drawScaledImage(
    tmpCtx,
    sourceEl,
    clipProjectRect,
    { mode: "continuous", progressiveMinify },
  );
  tmpCtx.globalCompositeOperation = "destination-in";
  drawScaledImage(
    tmpCtx,
    clipMaskSource,
    { x: 0, y: 0, width: maskWidth, height: maskHeight },
    { mode: "continuous" },
  );
  tmpCtx.globalCompositeOperation = "source-over";

  ctx.globalAlpha = clipOpacity;
  drawScaledImage(
    ctx,
    tmpCanvas,
    previewRect,
    { mode: previewScaleMode, progressiveMinify },
  );
  ctx.globalAlpha = 1;

  if (!overlayTint) return;

  const overlayCanvas = ensureReusableCanvas(maskOverlayCanvasRef, maskWidth, maskHeight);
  const overlayCtx = overlayCanvas.getContext("2d");
  if (!overlayCtx) return;

  overlayCtx.imageSmoothingEnabled = true;
  overlayCtx.imageSmoothingQuality = "high";
  overlayCtx.clearRect(0, 0, maskWidth, maskHeight);
  overlayCtx.globalCompositeOperation = "source-over";
  drawScaledImage(
    overlayCtx,
    clipMaskSource,
    { x: 0, y: 0, width: maskWidth, height: maskHeight },
    { mode: "continuous" },
  );
  overlayCtx.globalCompositeOperation = "source-in";
  overlayCtx.fillStyle = overlayTint;
  overlayCtx.fillRect(0, 0, maskWidth, maskHeight);

  drawScaledImage(
    ctx,
    overlayCanvas,
    previewRect,
    { mode: previewScaleMode, progressiveMinify },
  );
}
