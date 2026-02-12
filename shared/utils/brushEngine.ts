// ============================================
// Shared Brush Engine — pure Canvas2D drawing primitives
// Used by: editor brush/eraser, video mask paint/erase
// ============================================

/**
 * Parameters for a single dab (one stamp of the brush).
 */
export interface DabParams {
  x: number;
  y: number;
  /** Brush radius in pixels (half of brush size) */
  radius: number;
  /** Hardness 0–1: fraction of radius that is fully opaque. 1 = hard, 0 = fully soft */
  hardness: number;
  /** RGB color "#rrggbb". Ignored when isEraser is true. */
  color: string;
  /** Overall alpha 0–1 applied via globalAlpha */
  alpha: number;
  /** If true, uses linear alpha subtraction eraser. */
  isEraser: boolean;
}

/**
 * Parameters for drawing an interpolated line of dabs.
 */
export interface LineParams {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Spacing between dabs in pixels (clamped to >= 1) */
  spacing: number;
  /** Shared dab properties (x/y overridden per dab) */
  dab: Omit<DabParams, "x" | "y">;
}

/**
 * Parameters for linear-alpha erasing (subtract alpha amount from pixels).
 */
export interface EraseDabParams {
  x: number;
  y: number;
  radius: number;
  hardness: number;
  alpha: number;
}

export interface EraseLineParams {
  from: { x: number; y: number };
  to: { x: number; y: number };
  spacing: number;
  dab: Omit<EraseDabParams, "x" | "y">;
}

export interface EraseByMaskParams {
  maskCanvas: HTMLCanvasElement;
  alphaScale?: number;
  bounds?: { x: number; y: number; width: number; height: number };
}

/**
 * Parse "#rrggbb" into [r, g, b].
 */
export function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const eraseMaskScratch: {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
} = {
  canvas: null,
  ctx: null,
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function getCanvasSize(ctx: CanvasRenderingContext2D): { width: number; height: number } {
  return { width: ctx.canvas.width, height: ctx.canvas.height };
}

function getDabBounds(
  x: number,
  y: number,
  radius: number,
  canvasWidth: number,
  canvasHeight: number
): RectBounds | null {
  const pad = 1;
  const left = Math.floor(x - radius - pad);
  const top = Math.floor(y - radius - pad);
  const right = Math.ceil(x + radius + pad);
  const bottom = Math.ceil(y + radius + pad);

  const clampedLeft = Math.max(0, Math.min(canvasWidth, left));
  const clampedTop = Math.max(0, Math.min(canvasHeight, top));
  const clampedRight = Math.max(0, Math.min(canvasWidth, right));
  const clampedBottom = Math.max(0, Math.min(canvasHeight, bottom));

  const width = clampedRight - clampedLeft;
  const height = clampedBottom - clampedTop;
  if (width <= 0 || height <= 0) return null;

  return { x: clampedLeft, y: clampedTop, width, height };
}

function clampBoundsToCanvas(
  bounds: RectBounds,
  canvasWidth: number,
  canvasHeight: number
): RectBounds | null {
  const x = Math.max(0, Math.min(canvasWidth, bounds.x));
  const y = Math.max(0, Math.min(canvasHeight, bounds.y));
  const right = Math.max(0, Math.min(canvasWidth, bounds.x + bounds.width));
  const bottom = Math.max(0, Math.min(canvasHeight, bounds.y + bounds.height));
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function ensureEraseMaskScratch(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;

  if (
    !eraseMaskScratch.canvas
    || !eraseMaskScratch.ctx
    || eraseMaskScratch.canvas.width !== width
    || eraseMaskScratch.canvas.height !== height
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    eraseMaskScratch.canvas = canvas;
    eraseMaskScratch.ctx = ctx;
  }

  return eraseMaskScratch.ctx;
}

function drawEraserShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  hardness: number
): void {
  if (hardness >= 0.99) {
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  const innerStop = Math.max(0.01, hardness);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(innerStop, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function fallbackDestinationOutErase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  hardness: number,
  alpha: number
): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = clamp01(alpha);

  if (hardness >= 0.99) {
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const innerStop = Math.max(0.01, hardness);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(innerStop, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Linear eraser: subtract fixed alpha amount per dab (not remaining-alpha percentage).
 */
export function eraseDabLinear(ctx: CanvasRenderingContext2D, p: EraseDabParams): void {
  const alpha = clamp01(p.alpha);
  if (alpha <= 0 || p.radius <= 0) return;

  const { width: canvasWidth, height: canvasHeight } = getCanvasSize(ctx);
  const bounds = getDabBounds(p.x, p.y, p.radius, canvasWidth, canvasHeight);
  if (!bounds) return;

  try {
    const maskCtx = ensureEraseMaskScratch(bounds.width, bounds.height);
    if (!maskCtx) {
      fallbackDestinationOutErase(ctx, p.x, p.y, p.radius, p.hardness, alpha);
      return;
    }

    maskCtx.clearRect(0, 0, bounds.width, bounds.height);
    drawEraserShape(maskCtx, p.x - bounds.x, p.y - bounds.y, p.radius, p.hardness);

    const targetImage = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
    const maskImage = maskCtx.getImageData(0, 0, bounds.width, bounds.height);
    const target = targetImage.data;
    const mask = maskImage.data;

    for (let i = 3; i < target.length; i += 4) {
      const maskAlpha = mask[i];
      if (maskAlpha === 0) continue;
      const eraseAmount = maskAlpha * alpha;
      target[i] = Math.max(0, target[i] - eraseAmount);
    }

    ctx.putImageData(targetImage, bounds.x, bounds.y);
  } catch {
    fallbackDestinationOutErase(ctx, p.x, p.y, p.radius, p.hardness, alpha);
  }
}

export function eraseLineLinear(ctx: CanvasRenderingContext2D, p: EraseLineParams): void {
  const { from, to, spacing, dab } = p;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const clampedSpacing = Math.max(1, spacing);
  const steps = Math.ceil(distance / clampedSpacing);

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    eraseDabLinear(ctx, {
      ...dab,
      x: from.x + dx * t,
      y: from.y + dy * t,
    });
  }
}

export function eraseByMaskLinear(ctx: CanvasRenderingContext2D, p: EraseByMaskParams): void {
  const maskCtx = p.maskCanvas.getContext("2d");
  if (!maskCtx) return;

  const alphaScale = clamp01(p.alphaScale ?? 1);
  if (alphaScale <= 0) return;

  const { width: canvasWidth, height: canvasHeight } = getCanvasSize(ctx);
  const rawBounds = p.bounds ?? {
    x: 0,
    y: 0,
    width: Math.min(canvasWidth, p.maskCanvas.width),
    height: Math.min(canvasHeight, p.maskCanvas.height),
  };
  const bounds = clampBoundsToCanvas(rawBounds, canvasWidth, canvasHeight);
  if (!bounds) return;

  try {
    const targetImage = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
    const maskImage = maskCtx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
    const target = targetImage.data;
    const mask = maskImage.data;

    for (let i = 3; i < target.length; i += 4) {
      const maskAlpha = mask[i];
      if (maskAlpha === 0) continue;
      const eraseAmount = maskAlpha * alphaScale;
      target[i] = Math.max(0, target[i] - eraseAmount);
    }

    ctx.putImageData(targetImage, bounds.x, bounds.y);
  } catch {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = alphaScale;
    ctx.drawImage(p.maskCanvas, 0, 0);
    ctx.restore();
  }
}

/**
 * Draw a single soft/hard dab.
 * Eraser mode is handled internally via linear-alpha subtraction.
 */
export function drawDab(ctx: CanvasRenderingContext2D, p: DabParams): void {
  const { x, y, radius, hardness, color, alpha, isEraser } = p;

  if (isEraser) {
    eraseDabLinear(ctx, { x, y, radius, hardness, alpha });
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  if (hardness >= 0.99) {
    // Hard brush: solid circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Soft brush: radial gradient
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const innerStop = Math.max(0.01, hardness);

    const [r, g, b] = parseHexColor(color);
    gradient.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gradient.addColorStop(innerStop, `rgba(${r},${g},${b},1)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw an interpolated line of dabs from `from` to `to`.
 */
export function drawLine(ctx: CanvasRenderingContext2D, p: LineParams): void {
  const { from, to, spacing, dab } = p;
  if (dab.isEraser) {
    eraseLineLinear(ctx, {
      from,
      to,
      spacing,
      dab: {
        radius: dab.radius,
        hardness: dab.hardness,
        alpha: dab.alpha,
      },
    });
    return;
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const clampedSpacing = Math.max(1, spacing);
  const steps = Math.ceil(distance / clampedSpacing);

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    drawDab(ctx, {
      ...dab,
      x: from.x + dx * t,
      y: from.y + dy * t,
    });
  }
}
