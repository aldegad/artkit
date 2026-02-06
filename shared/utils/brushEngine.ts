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
  /** If true, draws black gradient (caller sets globalCompositeOperation = "destination-out") */
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

/**
 * Draw a single soft/hard dab.
 * The caller is responsible for setting ctx.globalCompositeOperation
 * (e.g. "destination-out" for erasing) before calling this.
 */
export function drawDab(ctx: CanvasRenderingContext2D, p: DabParams): void {
  const { x, y, radius, hardness, color, alpha, isEraser } = p;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (hardness >= 0.99) {
    // Hard brush: solid circle
    ctx.fillStyle = isEraser ? "#000000" : color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Soft brush: radial gradient
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const innerStop = Math.max(0.01, hardness);

    if (isEraser) {
      gradient.addColorStop(0, "rgba(0,0,0,1)");
      gradient.addColorStop(innerStop, "rgba(0,0,0,1)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
    } else {
      const [r, g, b] = parseHexColor(color);
      gradient.addColorStop(0, `rgba(${r},${g},${b},1)`);
      gradient.addColorStop(innerStop, `rgba(${r},${g},${b},1)`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    }

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
