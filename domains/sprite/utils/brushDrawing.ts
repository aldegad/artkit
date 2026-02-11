import { calculateDrawingParameters } from "@/domains/image/constants/brushPresets";
import type { BrushPreset } from "@/domains/image/types/brush";
import { drawDab as sharedDrawDab } from "@/shared/utils/brushEngine";
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
  pressure?: number;
  frameCtx: CanvasRenderingContext2D | null;
  frameCanvas: HTMLCanvasElement | null;
  activePreset: BrushPreset;
  brushSize: number;
  brushHardness: number;
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
  pressure = 1,
  frameCtx,
  frameCanvas,
  activePreset,
  brushSize,
  brushHardness,
  pressureEnabled,
  selection,
  selectionMaskCanvas,
  ensureDabBufferCanvas,
}: DrawSpriteBrushPixelOptions): boolean {
  if (!frameCtx || !frameCanvas) return false;

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
      color,
      alpha: params.opacity * params.flow,
      isEraser,
    });

    dabBuffer.ctx.save();
    dabBuffer.ctx.globalCompositeOperation = "destination-in";
    dabBuffer.ctx.drawImage(selectionMaskCanvas, 0, 0);
    dabBuffer.ctx.restore();

    frameCtx.save();
    if (isEraser) {
      frameCtx.globalCompositeOperation = "destination-out";
    }
    frameCtx.drawImage(dabBuffer.canvas, 0, 0);
    frameCtx.restore();
    return true;
  }

  frameCtx.save();
  if (isEraser) {
    frameCtx.globalCompositeOperation = "destination-out";
  }

  sharedDrawDab(frameCtx, {
    x,
    y,
    radius: params.size / 2,
    hardness: brushHardness / 100,
    color,
    alpha: params.opacity * params.flow,
    isEraser,
  });

  frameCtx.restore();
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
