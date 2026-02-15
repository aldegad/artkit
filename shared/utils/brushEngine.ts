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
  const input = (hex || "").trim();
  const raw = input.startsWith("#") ? input.slice(1) : input;

  const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const parseHexByte = (value: string): number => {
    const parsed = Number.parseInt(value, 16);
    return Number.isFinite(parsed) ? clampByte(parsed) : 0;
  };

  if (/^[\da-fA-F]{3}$/.test(raw)) {
    return [
      parseHexByte(raw[0] + raw[0]),
      parseHexByte(raw[1] + raw[1]),
      parseHexByte(raw[2] + raw[2]),
    ];
  }

  if (/^[\da-fA-F]{6,8}$/.test(raw)) {
    return [
      parseHexByte(raw.substring(0, 2)),
      parseHexByte(raw.substring(2, 4)),
      parseHexByte(raw.substring(4, 6)),
    ];
  }

  const rgbMatch = input.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").slice(0, 3).map((part) => clampByte(Number.parseFloat(part)));
    if (parts.length === 3 && parts.every((value) => Number.isFinite(value))) {
      return [parts[0], parts[1], parts[2]];
    }
  }

  return [0, 0, 0];
}

interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EraseAlphaCarryState {
  width: number;
  height: number;
  values: Uint8Array;
}

interface PaintColorCarryState {
  width: number;
  height: number;
  alphaValues: Uint8Array;
  channelDeltaValues: Int16Array;
}

const eraseMaskScratch: {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
} = {
  canvas: null,
  ctx: null,
};

const eraseAlphaCarryScratch = new WeakMap<object, EraseAlphaCarryState>();
const paintAlphaCarryScratch = new WeakMap<object, PaintColorCarryState>();
// Disabled for now: low-alpha linear paint path can introduce visible stamp artifacts.
const LOW_ALPHA_LINEAR_PAINT_THRESHOLD = 0;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
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

function ensureEraseAlphaCarryState(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): EraseAlphaCarryState | null {
  const canvasKey = ctx.canvas as object | null;
  if (!canvasKey) return null;

  const existing = eraseAlphaCarryScratch.get(canvasKey);
  if (!existing || existing.width !== width || existing.height !== height) {
    const created: EraseAlphaCarryState = {
      width,
      height,
      values: new Uint8Array(width * height),
    };
    eraseAlphaCarryScratch.set(canvasKey, created);
    return created;
  }

  return existing;
}

function ensurePaintAlphaCarryState(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): PaintColorCarryState | null {
  const canvasKey = ctx.canvas as object | null;
  if (!canvasKey) return null;

  const existing = paintAlphaCarryScratch.get(canvasKey);
  if (!existing || existing.width !== width || existing.height !== height) {
    const created: PaintColorCarryState = {
      width,
      height,
      alphaValues: new Uint8Array(width * height),
      channelDeltaValues: new Int16Array(width * height * 3),
    };
    paintAlphaCarryScratch.set(canvasKey, created);
    return created;
  }

  return existing;
}

/**
 * Clear accumulated fractional erase state for a canvas context.
 * Call this at the start of a new erase stroke to avoid cross-stroke carry artifacts.
 */
export function resetEraseAlphaCarry(ctx: CanvasRenderingContext2D): void {
  const canvasKey = ctx.canvas as object | null;
  if (!canvasKey) return;
  eraseAlphaCarryScratch.delete(canvasKey);
}

/**
 * Clear accumulated fractional paint state for a canvas context.
 * Call this at the start of a new low-opacity paint stroke.
 */
export function resetPaintAlphaCarry(ctx: CanvasRenderingContext2D): void {
  const canvasKey = ctx.canvas as object | null;
  if (!canvasKey) return;
  paintAlphaCarryScratch.delete(canvasKey);
}

function applyLinearAlphaErase(
  target: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  bounds: RectBounds,
  canvasWidth: number,
  alphaScale: number,
  carryState: EraseAlphaCarryState | null
): void {
  if (alphaScale <= 0) return;

  const rowStride = bounds.width * 4;
  const carry = carryState?.values ?? null;

  for (let row = 0; row < bounds.height; row += 1) {
    const rowOffset = row * rowStride;
    const canvasRowOffset = (bounds.y + row) * canvasWidth + bounds.x;

    for (let col = 0; col < bounds.width; col += 1) {
      const alphaIndex = rowOffset + col * 4 + 3;
      const redIndex = alphaIndex - 3;
      const greenIndex = alphaIndex - 2;
      const blueIndex = alphaIndex - 1;
      const maskAlpha = mask[alphaIndex];
      if (maskAlpha === 0) continue;

      const targetAlpha = target[alphaIndex];
      const originalR = target[redIndex];
      const originalG = target[greenIndex];
      const originalB = target[blueIndex];
      if (targetAlpha === 0) {
        if (carry) carry[canvasRowOffset + col] = 0;
        continue;
      }

      const eraseAmount = maskAlpha * alphaScale;
      if (eraseAmount <= 0) continue;

      let eraseWhole: number;
      if (carry) {
        const pixelIndex = canvasRowOffset + col;
        const totalEraseFixed = eraseAmount * 256 + carry[pixelIndex];
        eraseWhole = Math.floor(totalEraseFixed / 256);
        carry[pixelIndex] = Math.floor(totalEraseFixed - eraseWhole * 256);
      } else {
        eraseWhole = Math.round(eraseAmount);
      }

      if (eraseWhole <= 0) continue;

      const nextAlpha = targetAlpha - eraseWhole;
      if (nextAlpha <= 0) {
        target[redIndex] = 0;
        target[greenIndex] = 0;
        target[blueIndex] = 0;
        target[alphaIndex] = 0;
        if (carry) carry[canvasRowOffset + col] = 0;
      } else {
        // Keep original color channels untouched while alpha is non-zero.
        target[redIndex] = originalR;
        target[greenIndex] = originalG;
        target[blueIndex] = originalB;
        target[alphaIndex] = nextAlpha;
      }
    }
  }
}

function applyLinearColorPaint(
  target: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  bounds: RectBounds,
  canvasWidth: number,
  alphaScale: number,
  color: [number, number, number],
  carryState: PaintColorCarryState | null
): void {
  if (alphaScale <= 0) return;

  const rowStride = bounds.width * 4;
  const alphaCarry = carryState?.alphaValues ?? null;
  const channelCarry = carryState?.channelDeltaValues ?? null;

  for (let row = 0; row < bounds.height; row += 1) {
    const rowOffset = row * rowStride;
    const canvasRowOffset = (bounds.y + row) * canvasWidth + bounds.x;

    for (let col = 0; col < bounds.width; col += 1) {
      const alphaIndex = rowOffset + col * 4 + 3;
      const maskAlpha = mask[alphaIndex];
      if (maskAlpha === 0) continue;

      const pixelIndex = canvasRowOffset + col;
      const scaledAlpha = maskAlpha * alphaScale;

      let srcAlpha: number;
      if (alphaCarry) {
        const totalAlphaFixed = scaledAlpha * 256 + alphaCarry[pixelIndex];
        srcAlpha = Math.floor(totalAlphaFixed / 256);
        alphaCarry[pixelIndex] = Math.floor(totalAlphaFixed - srcAlpha * 256);
      } else {
        srcAlpha = Math.round(scaledAlpha);
      }

      if (srcAlpha <= 0) continue;

      const redIndex = alphaIndex - 3;
      const greenIndex = alphaIndex - 2;
      const blueIndex = alphaIndex - 1;
      const channelCarryIndex = pixelIndex * 3;

      if (srcAlpha >= 255) {
        target[redIndex] = color[0];
        target[greenIndex] = color[1];
        target[blueIndex] = color[2];
        target[alphaIndex] = 255;
        if (alphaCarry) alphaCarry[pixelIndex] = 0;
        if (channelCarry) {
          channelCarry[channelCarryIndex] = 0;
          channelCarry[channelCarryIndex + 1] = 0;
          channelCarry[channelCarryIndex + 2] = 0;
        }
        continue;
      }

      const dstAlpha = target[alphaIndex];

      // Fast path for opaque destination: apply signed channel carry to avoid
      // low-opacity per-channel quantization artifacts (red/green speckles).
      if (dstAlpha >= 255) {
        const invSrcAlpha = 255 - srcAlpha;
        if (channelCarry) {
          const blendChannel = (dst: number, src: number, carryIndex: number): number => {
            const total = (src - dst) * srcAlpha + channelCarry[carryIndex];
            const step = total >= 0 ? Math.floor(total / 255) : Math.ceil(total / 255);
            channelCarry[carryIndex] = total - step * 255;
            return clampByte(dst + step);
          };

          target[redIndex] = blendChannel(target[redIndex], color[0], channelCarryIndex);
          target[greenIndex] = blendChannel(target[greenIndex], color[1], channelCarryIndex + 1);
          target[blueIndex] = blendChannel(target[blueIndex], color[2], channelCarryIndex + 2);
        } else {
          target[redIndex] = clampByte((color[0] * srcAlpha + target[redIndex] * invSrcAlpha) / 255);
          target[greenIndex] = clampByte((color[1] * srcAlpha + target[greenIndex] * invSrcAlpha) / 255);
          target[blueIndex] = clampByte((color[2] * srcAlpha + target[blueIndex] * invSrcAlpha) / 255);
        }
        target[alphaIndex] = 255;
        continue;
      }

      if (channelCarry) {
        channelCarry[channelCarryIndex] = 0;
        channelCarry[channelCarryIndex + 1] = 0;
        channelCarry[channelCarryIndex + 2] = 0;
      }

      const invSrcAlpha = 255 - srcAlpha;
      const outAlpha = srcAlpha + Math.round((dstAlpha * invSrcAlpha) / 255);

      if (outAlpha <= 0) {
        target[redIndex] = 0;
        target[greenIndex] = 0;
        target[blueIndex] = 0;
        target[alphaIndex] = 0;
        if (alphaCarry) alphaCarry[pixelIndex] = 0;
        continue;
      }

      const dstBlendFactor = dstAlpha * invSrcAlpha;
      const outPremultR = color[0] * srcAlpha + Math.round((target[redIndex] * dstBlendFactor) / 255);
      const outPremultG = color[1] * srcAlpha + Math.round((target[greenIndex] * dstBlendFactor) / 255);
      const outPremultB = color[2] * srcAlpha + Math.round((target[blueIndex] * dstBlendFactor) / 255);

      target[redIndex] = clampByte(outPremultR / outAlpha);
      target[greenIndex] = clampByte(outPremultG / outAlpha);
      target[blueIndex] = clampByte(outPremultB / outAlpha);
      target[alphaIndex] = outAlpha;
    }
  }
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

function drawColorDabWithCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  hardness: number,
  color: string,
  alpha: number
): void {
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

function paintDabLinear(ctx: CanvasRenderingContext2D, p: Omit<DabParams, "isEraser">): void {
  const alpha = clamp01(p.alpha);
  if (alpha <= 0 || p.radius <= 0) return;

  const { width: canvasWidth, height: canvasHeight } = getCanvasSize(ctx);
  const carryState = ensurePaintAlphaCarryState(ctx, canvasWidth, canvasHeight);
  const bounds = getDabBounds(p.x, p.y, p.radius, canvasWidth, canvasHeight);
  if (!bounds) return;

  try {
    const maskCtx = ensureEraseMaskScratch(bounds.width, bounds.height);
    if (!maskCtx) {
      drawColorDabWithCanvas(ctx, p.x, p.y, p.radius, p.hardness, p.color, alpha);
      return;
    }

    maskCtx.clearRect(0, 0, bounds.width, bounds.height);
    drawEraserShape(maskCtx, p.x - bounds.x, p.y - bounds.y, p.radius, p.hardness);

    const targetImage = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
    const maskImage = maskCtx.getImageData(0, 0, bounds.width, bounds.height);
    const target = targetImage.data;
    const mask = maskImage.data;
    const color = parseHexColor(p.color);

    applyLinearColorPaint(target, mask, bounds, canvasWidth, alpha, color, carryState);

    ctx.putImageData(targetImage, bounds.x, bounds.y);
  } catch {
    drawColorDabWithCanvas(ctx, p.x, p.y, p.radius, p.hardness, p.color, alpha);
  }
}

/**
 * Linear eraser: subtract fixed alpha amount per dab (not remaining-alpha percentage).
 */
export function eraseDabLinear(ctx: CanvasRenderingContext2D, p: EraseDabParams): void {
  const alpha = clamp01(p.alpha);
  if (alpha <= 0 || p.radius <= 0) return;

  const { width: canvasWidth, height: canvasHeight } = getCanvasSize(ctx);
  const carryState = ensureEraseAlphaCarryState(ctx, canvasWidth, canvasHeight);
  const bounds = getDabBounds(p.x, p.y, p.radius, canvasWidth, canvasHeight);
  if (!bounds) return;

  try {
    const maskCtx = ensureEraseMaskScratch(bounds.width, bounds.height);
    if (!maskCtx) return;

    maskCtx.clearRect(0, 0, bounds.width, bounds.height);
    drawEraserShape(maskCtx, p.x - bounds.x, p.y - bounds.y, p.radius, p.hardness);

    const targetImage = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
    const maskImage = maskCtx.getImageData(0, 0, bounds.width, bounds.height);
    const target = targetImage.data;
    const mask = maskImage.data;

    // Strict alpha-only erase: keep RGB unchanged while alpha > 0.
    applyLinearAlphaErase(target, mask, bounds, canvasWidth, alpha, carryState);

    ctx.putImageData(targetImage, bounds.x, bounds.y);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[brushEngine] eraseDabLinear alpha-only path failed", error);
    }
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
  const carryState = ensureEraseAlphaCarryState(ctx, canvasWidth, canvasHeight);
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

    // Strict alpha-only erase: keep RGB unchanged while alpha > 0.
    applyLinearAlphaErase(target, mask, bounds, canvasWidth, alphaScale, carryState);

    ctx.putImageData(targetImage, bounds.x, bounds.y);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[brushEngine] eraseByMaskLinear alpha-only path failed", error);
    }
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

  const clampedAlpha = clamp01(alpha);
  if (clampedAlpha <= LOW_ALPHA_LINEAR_PAINT_THRESHOLD) {
    paintDabLinear(ctx, { x, y, radius, hardness, color, alpha: clampedAlpha });
  } else {
    drawColorDabWithCanvas(ctx, x, y, radius, hardness, color, clampedAlpha);
  }
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
