import { calculateDrawingParameters } from "@/domains/image/constants/brushPresets";
import type { BrushPreset } from "@/domains/image/types/brush";
import {
  drawDab as sharedDrawDab,
  eraseByMaskLinear,
  eraseDabLinear,
  resetEraseAlphaCarry,
} from "@/shared/utils/brushEngine";
import { isMagicWandPixelSelected, type MagicWandSelection } from "@/shared/utils/magicWand";
import { normalizePressureValue } from "@/shared/utils/pointerPressure";

export interface DabBufferCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

interface DrawSpriteBrushPixelOptions {
  x: number;
  y: number;
  color: string;
  isEraser?: boolean;
  isStrokeStart?: boolean;
  pressure?: number;
  frameCtx: CanvasRenderingContext2D | null;
  frameCanvas: HTMLCanvasElement | null;
  activePreset: BrushPreset;
  brushSize: number;
  brushHardness: number;
  brushOpacity: number;
  pressureEnabled: boolean;
  selection: MagicWandSelection | null;
  selectionMaskCanvas: HTMLCanvasElement | null;
  ensureDabBufferCanvas: (width: number, height: number) => DabBufferCanvas | null;
}

interface DrawInterpolatedStrokeOptions {
  from: { x: number; y: number };
  to: { x: number; y: number };
  drawAt: (x: number, y: number) => void;
}

export function drawSpriteBrushPixel({
  x,
  y,
  color,
  isEraser = false,
  isStrokeStart = false,
  pressure = 1,
  frameCtx,
  frameCanvas,
  activePreset,
  brushSize,
  brushHardness,
  brushOpacity,
  pressureEnabled,
  selection,
  selectionMaskCanvas,
  ensureDabBufferCanvas,
}: DrawSpriteBrushPixelOptions): boolean {
  if (!frameCtx || !frameCanvas) return false;
  if (isEraser && isStrokeStart) {
    resetEraseAlphaCarry(frameCtx);
  }

  const params = calculateDrawingParameters(
    normalizePressureValue(pressure),
    activePreset,
    brushSize,
    pressureEnabled,
  );

  if (selection && selectionMaskCanvas) {
    if (
      selection.width !== frameCanvas.width
      || selection.height !== frameCanvas.height
      || !isMagicWandPixelSelected(selection, x, y)
    ) {
      return false;
    }

    const dabBuffer = ensureDabBufferCanvas(frameCanvas.width, frameCanvas.height);
    if (!dabBuffer) return false;

    dabBuffer.ctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
    sharedDrawDab(dabBuffer.ctx, {
      x,
      y,
      radius: params.size / 2,
      hardness: brushHardness / 100,
      // Eraser path uses this as alpha mask only, so draw white.
      color: isEraser ? "#ffffff" : color,
      alpha: (brushOpacity / 100) * params.opacity * params.flow,
      isEraser: false,
    });

    dabBuffer.ctx.save();
    dabBuffer.ctx.globalCompositeOperation = "destination-in";
    dabBuffer.ctx.drawImage(selectionMaskCanvas, 0, 0);
    dabBuffer.ctx.restore();

    if (isEraser) {
      const radius = params.size / 2;
      eraseByMaskLinear(frameCtx, {
        maskCanvas: dabBuffer.canvas,
        alphaScale: 1,
        bounds: {
          x: Math.floor(x - radius - 2),
          y: Math.floor(y - radius - 2),
          width: Math.ceil(radius * 2 + 4),
          height: Math.ceil(radius * 2 + 4),
        },
      });
    } else {
      frameCtx.drawImage(dabBuffer.canvas, 0, 0);
    }
    return true;
  }

  if (isEraser) {
    eraseDabLinear(frameCtx, {
      x,
      y,
      radius: params.size / 2,
      hardness: brushHardness / 100,
      alpha: (brushOpacity / 100) * params.opacity * params.flow,
    });
  } else {
    sharedDrawDab(frameCtx, {
      x,
      y,
      radius: params.size / 2,
      hardness: brushHardness / 100,
      color,
      alpha: (brushOpacity / 100) * params.opacity * params.flow,
      isEraser: false,
    });
  }
  return true;
}

export function drawInterpolatedStroke({ from, to, drawAt }: DrawInterpolatedStrokeOptions): boolean {
  const lineDx = to.x - from.x;
  const lineDy = to.y - from.y;
  const steps = Math.max(Math.abs(lineDx), Math.abs(lineDy));

  if (steps <= 0) {
    return false;
  }

  for (let i = 1; i <= steps; i += 1) {
    const x = Math.round(from.x + (lineDx * i) / steps);
    const y = Math.round(from.y + (lineDy * i) / steps);
    drawAt(x, y);
  }

  return true;
}
