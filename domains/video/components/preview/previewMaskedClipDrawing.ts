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
  smoothingQuality?: ImageSmoothingQuality;
  maskTempCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  maskOverlayCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  overlayTint: string | null;
}

interface DrawMaskTintOverlayOptions {
  ctx: CanvasRenderingContext2D;
  clipMaskSource: CanvasImageSource;
  projectSize: SizeLike;
  previewRect: RectLike;
  previewScaleMode: CanvasScaleMode;
  smoothingQuality?: ImageSmoothingQuality;
  maskOverlayCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  overlayTint: string;
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
  smoothingQuality = "high",
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
  tmpCtx.imageSmoothingQuality = smoothingQuality;
  tmpCtx.clearRect(0, 0, maskWidth, maskHeight);
  tmpCtx.globalCompositeOperation = "source-over";
  tmpCtx.globalAlpha = 1;
  drawScaledImage(
    tmpCtx,
    sourceEl,
    clipProjectRect,
    { mode: "continuous", progressiveMinify, smoothingQuality },
  );
  tmpCtx.globalCompositeOperation = "destination-in";
  drawScaledImage(
    tmpCtx,
    clipMaskSource,
    { x: 0, y: 0, width: maskWidth, height: maskHeight },
    { mode: "continuous", smoothingQuality },
  );
  tmpCtx.globalCompositeOperation = "source-over";

  ctx.globalAlpha = clipOpacity;
  drawScaledImage(
    ctx,
    tmpCanvas,
    previewRect,
    { mode: previewScaleMode, progressiveMinify, smoothingQuality },
  );
  ctx.globalAlpha = 1;

  if (!overlayTint) return;

  const overlayCanvas = ensureReusableCanvas(maskOverlayCanvasRef, maskWidth, maskHeight);
  const overlayCtx = overlayCanvas.getContext("2d");
  if (!overlayCtx) return;

  overlayCtx.imageSmoothingEnabled = true;
  overlayCtx.imageSmoothingQuality = smoothingQuality;
  overlayCtx.clearRect(0, 0, maskWidth, maskHeight);
  overlayCtx.globalCompositeOperation = "source-over";
  drawScaledImage(
    overlayCtx,
    clipMaskSource,
    { x: 0, y: 0, width: maskWidth, height: maskHeight },
    { mode: "continuous", smoothingQuality },
  );
  overlayCtx.globalCompositeOperation = "source-in";
  overlayCtx.fillStyle = overlayTint;
  overlayCtx.fillRect(0, 0, maskWidth, maskHeight);

  drawScaledImage(
    ctx,
    overlayCanvas,
    previewRect,
    { mode: previewScaleMode, progressiveMinify, smoothingQuality },
  );
}

export function drawMaskTintOverlay({
  ctx,
  clipMaskSource,
  projectSize,
  previewRect,
  previewScaleMode,
  smoothingQuality = "high",
  maskOverlayCanvasRef,
  overlayTint,
}: DrawMaskTintOverlayOptions): void {
  const maskWidth = projectSize.width;
  const maskHeight = projectSize.height;
  const overlayCanvas = ensureReusableCanvas(maskOverlayCanvasRef, maskWidth, maskHeight);
  const overlayCtx = overlayCanvas.getContext("2d");
  if (!overlayCtx) return;

  overlayCtx.imageSmoothingEnabled = true;
  overlayCtx.imageSmoothingQuality = smoothingQuality;
  overlayCtx.clearRect(0, 0, maskWidth, maskHeight);
  overlayCtx.globalCompositeOperation = "source-over";
  drawScaledImage(
    overlayCtx,
    clipMaskSource,
    { x: 0, y: 0, width: maskWidth, height: maskHeight },
    { mode: "continuous", smoothingQuality },
  );
  overlayCtx.globalCompositeOperation = "source-in";
  overlayCtx.fillStyle = overlayTint;
  overlayCtx.fillRect(0, 0, maskWidth, maskHeight);
  overlayCtx.globalCompositeOperation = "source-over";

  drawScaledImage(
    ctx,
    overlayCanvas,
    previewRect,
    { mode: previewScaleMode, progressiveMinify: false, smoothingQuality },
  );
}
