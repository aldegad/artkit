export interface BrushCursorRenderOptions {
  x: number;
  y: number;
  size: number;
  hardness: number;
  color: string;
  isEraser?: boolean;
  showCrosshair?: boolean;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface BrushCursorPalette {
  ringColor: string;
  outlineColor: string;
  fillSolid: string;
  fillTransparent: string;
}

export interface BrushCursorVisuals {
  ringColor: string;
  outlineColor: string;
  gradient: string;
}

const DEFAULT_BRUSH_COLOR = "#ffffff";
const DEFAULT_ERASER_COLOR = "#f87171";
const DEFAULT_OUTLINE = "rgba(0, 0, 0, 0.55)";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function hexToRgb(hex: string): RgbColor | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  if (normalized.length !== 6) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

function toRgba(color: string, alpha: number): string {
  const parsed = hexToRgb(color);
  if (!parsed) {
    return color;
  }
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
}

function resolvePalette(color: string, isEraser: boolean): BrushCursorPalette {
  const base = isEraser ? DEFAULT_ERASER_COLOR : color || DEFAULT_BRUSH_COLOR;
  return {
    ringColor: toRgba(base, 0.95),
    outlineColor: DEFAULT_OUTLINE,
    fillSolid: toRgba(base, isEraser ? 0.2 : 0.16),
    fillTransparent: toRgba(base, 0),
  };
}

export function getBrushCursorVisuals(
  hardness: number,
  color: string,
  isEraser: boolean = false
): BrushCursorVisuals {
  const palette = resolvePalette(color, isEraser);
  const hard = clamp01(hardness / 100);
  const innerStop = Math.max(2, Math.min(98, Math.round(hard * 100)));
  return {
    ringColor: palette.ringColor,
    outlineColor: palette.outlineColor,
    gradient: `radial-gradient(circle, ${palette.fillSolid} 0%, ${palette.fillSolid} ${innerStop}%, ${palette.fillTransparent} 100%)`,
  };
}

export function getBrushCursorGradient(
  hardness: number,
  color: string,
  isEraser: boolean = false
): string {
  return getBrushCursorVisuals(hardness, color, isEraser).gradient;
}

export function drawBrushCursor(
  ctx: CanvasRenderingContext2D,
  options: BrushCursorRenderOptions
): void {
  const {
    x,
    y,
    size,
    hardness,
    color,
    isEraser = false,
    showCrosshair = true,
  } = options;
  const radius = Math.max(0.5, size / 2);
  const palette = resolvePalette(color, isEraser);
  const hard = clamp01(hardness / 100);
  const innerStop = Math.max(0.02, hard);

  ctx.save();

  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, palette.fillSolid);
  gradient.addColorStop(innerStop, palette.fillSolid);
  gradient.addColorStop(1, palette.fillTransparent);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = palette.outlineColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius + 0.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = palette.ringColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (showCrosshair) {
    const crosshairLength = Math.max(3, Math.min(radius * 0.45, 7));
    ctx.strokeStyle = palette.outlineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - crosshairLength, y);
    ctx.lineTo(x + crosshairLength, y);
    ctx.moveTo(x, y - crosshairLength);
    ctx.lineTo(x, y + crosshairLength);
    ctx.stroke();

    ctx.strokeStyle = palette.ringColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - crosshairLength, y);
    ctx.lineTo(x + crosshairLength, y);
    ctx.moveTo(x, y - crosshairLength);
    ctx.lineTo(x, y + crosshairLength);
    ctx.stroke();
  }

  ctx.restore();
}
