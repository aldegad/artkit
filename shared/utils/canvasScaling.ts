export type CanvasScaleMode = "continuous" | "pixel-art";

export interface CanvasScaleScratch {
  primary: HTMLCanvasElement | null;
  secondary: HTMLCanvasElement | null;
}

export interface DrawScaledImageOptions {
  mode?: CanvasScaleMode;
  smoothingQuality?: ImageSmoothingQuality;
  snapToPixel?: boolean;
  progressiveMinify?: boolean;
  scratch?: CanvasScaleScratch;
}

export interface ResizeCanvasForDprOptions {
  maxDevicePixelRatio?: number;
  minDevicePixelRatio?: number;
  scaleContext?: boolean;
}

export interface ResizeCanvasForDprResult {
  width: number;
  height: number;
  dpr: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface PixelPreviewScalePolicy {
  mode: CanvasScaleMode;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
}

interface DrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SourceSize {
  width: number;
  height: number;
}

const fallbackScratch: CanvasScaleScratch = { primary: null, secondary: null };

function sanitizeCssSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export function resolvePixelPreviewScalePolicy(scale: number): PixelPreviewScalePolicy {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const imageSmoothingEnabled = safeScale < 1;
  return {
    mode: imageSmoothingEnabled ? "continuous" : "pixel-art",
    imageSmoothingEnabled,
    imageSmoothingQuality: imageSmoothingEnabled ? "high" : "low",
  };
}

export function applyPixelPreviewScalePolicy(
  ctx: CanvasRenderingContext2D,
  scale: number,
): PixelPreviewScalePolicy {
  const policy = resolvePixelPreviewScalePolicy(scale);
  ctx.imageSmoothingEnabled = policy.imageSmoothingEnabled;
  ctx.imageSmoothingQuality = policy.imageSmoothingQuality;
  return policy;
}

export function resizeCanvasForDpr(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D | null,
  width: number,
  height: number,
  options: ResizeCanvasForDprOptions = {},
): ResizeCanvasForDprResult {
  const cssWidth = sanitizeCssSize(width);
  const cssHeight = sanitizeCssSize(height);
  const deviceDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const minDpr = Math.max(1, options.minDevicePixelRatio ?? 1);
  const maxDpr = Math.max(minDpr, options.maxDevicePixelRatio ?? Number.POSITIVE_INFINITY);
  const dpr = Math.max(minDpr, Math.min(deviceDpr, maxDpr));
  const pixelWidth = Math.max(1, Math.round((cssWidth > 0 ? cssWidth : 1) * dpr));
  const pixelHeight = Math.max(1, Math.round((cssHeight > 0 ? cssHeight : 1) * dpr));

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const cssWidthStyle = `${cssWidth}px`;
  const cssHeightStyle = `${cssHeight}px`;
  if (canvas.style.width !== cssWidthStyle) {
    canvas.style.width = cssWidthStyle;
  }
  if (canvas.style.height !== cssHeightStyle) {
    canvas.style.height = cssHeightStyle;
  }

  if (ctx) {
    if (options.scaleContext) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  return {
    width: cssWidth,
    height: cssHeight,
    dpr,
    pixelWidth,
    pixelHeight,
  };
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getSourceSize(source: CanvasImageSource): SourceSize | null {
  const value = source as unknown as Record<string, unknown>;

  const videoWidth = readNumber(value.videoWidth);
  const videoHeight = readNumber(value.videoHeight);
  if (videoWidth && videoHeight) {
    return { width: videoWidth, height: videoHeight };
  }

  const naturalWidth = readNumber(value.naturalWidth);
  const naturalHeight = readNumber(value.naturalHeight);
  if (naturalWidth && naturalHeight) {
    return { width: naturalWidth, height: naturalHeight };
  }

  const displayWidth = readNumber(value.displayWidth);
  const displayHeight = readNumber(value.displayHeight);
  if (displayWidth && displayHeight) {
    return { width: displayWidth, height: displayHeight };
  }

  const width = readNumber(value.width);
  const height = readNumber(value.height);
  if (width && height) {
    return { width, height };
  }

  return null;
}

function ensureScratchCanvas(
  scratch: CanvasScaleScratch,
  key: "primary" | "secondary",
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  let canvas = scratch[key];
  if (!canvas) {
    canvas = document.createElement("canvas");
    scratch[key] = canvas;
  }
  const nextWidth = Math.max(1, Math.round(width));
  const nextHeight = Math.max(1, Math.round(height));
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
  return canvas;
}

function shouldUseProgressiveMinify(scaleX: number, scaleY: number): boolean {
  const minScale = Math.min(scaleX, scaleY);
  return minScale < 0.5;
}

function drawWithProgressiveMinify(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceSize: SourceSize,
  dest: DrawRect,
  smoothingQuality: ImageSmoothingQuality,
  scratch?: CanvasScaleScratch,
): boolean {
  if (typeof document === "undefined") return false;

  const store: CanvasScaleScratch = scratch ?? fallbackScratch;
  let currentSource: CanvasImageSource = source;
  let currentWidth = sourceSize.width;
  let currentHeight = sourceSize.height;
  let pass = 0;

  const targetWidth = Math.max(1, Math.round(Math.abs(dest.width)));
  const targetHeight = Math.max(1, Math.round(Math.abs(dest.height)));

  while (currentWidth * 0.5 >= targetWidth || currentHeight * 0.5 >= targetHeight) {
    const nextWidth = Math.max(targetWidth, Math.round(currentWidth * 0.5));
    const nextHeight = Math.max(targetHeight, Math.round(currentHeight * 0.5));
    const key = pass % 2 === 0 ? "primary" : "secondary";
    const nextCanvas = ensureScratchCanvas(store, key, nextWidth, nextHeight);
    if (!nextCanvas) return false;

    const nextCtx = nextCanvas.getContext("2d");
    if (!nextCtx) return false;

    nextCtx.setTransform(1, 0, 0, 1, 0, 0);
    nextCtx.clearRect(0, 0, nextWidth, nextHeight);
    nextCtx.imageSmoothingEnabled = true;
    nextCtx.imageSmoothingQuality = smoothingQuality;
    nextCtx.drawImage(
      currentSource,
      0,
      0,
      currentWidth,
      currentHeight,
      0,
      0,
      nextWidth,
      nextHeight,
    );

    currentSource = nextCanvas;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
    pass += 1;
  }

  ctx.drawImage(
    currentSource,
    0,
    0,
    currentWidth,
    currentHeight,
    dest.x,
    dest.y,
    dest.width,
    dest.height,
  );
  return true;
}

function drawNearestUpscaled(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  dest: DrawRect,
  snapToPixel: boolean,
): void {
  const x = snapToPixel ? Math.round(dest.x) : dest.x;
  const y = snapToPixel ? Math.round(dest.y) : dest.y;
  const width = snapToPixel ? Math.round(dest.width) : dest.width;
  const height = snapToPixel ? Math.round(dest.height) : dest.height;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, x, y, width, height);
}

export function drawScaledImage(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  dest: DrawRect,
  options: DrawScaledImageOptions = {},
): void {
  if (!(dest.width > 0) || !(dest.height > 0)) return;

  const sourceSize = getSourceSize(source);
  if (!sourceSize || !(sourceSize.width > 0) || !(sourceSize.height > 0)) {
    ctx.drawImage(source, dest.x, dest.y, dest.width, dest.height);
    return;
  }

  const mode = options.mode ?? "continuous";
  const smoothingQuality = options.smoothingQuality ?? "high";
  const scaleX = Math.abs(dest.width / sourceSize.width);
  const scaleY = Math.abs(dest.height / sourceSize.height);
  const isUpscaling = scaleX >= 1 && scaleY >= 1;

  if (mode === "pixel-art" && isUpscaling) {
    drawNearestUpscaled(ctx, source, dest, options.snapToPixel ?? true);
    return;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = smoothingQuality;

  const progressiveMinify = options.progressiveMinify ?? mode === "pixel-art";
  if (progressiveMinify && shouldUseProgressiveMinify(scaleX, scaleY)) {
    const didDraw = drawWithProgressiveMinify(
      ctx,
      source,
      sourceSize,
      dest,
      smoothingQuality,
      options.scratch,
    );
    if (didDraw) return;
  }

  ctx.drawImage(source, dest.x, dest.y, dest.width, dest.height);
}
