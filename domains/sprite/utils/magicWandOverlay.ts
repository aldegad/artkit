import {
  drawMagicWandSelectionOutline,
  type MagicWandSelection,
} from "@/shared/utils/magicWand";

const MAGIC_WAND_OVERLAY_ALPHA = 0.24;
const MAGIC_WAND_OUTLINE_DASH = [4, 4];
const MAGIC_WAND_OUTLINE_SPEED_MS = 140;

interface DrawMagicWandOverlayParams {
  ctx: CanvasRenderingContext2D;
  selection: MagicWandSelection;
  selectionMaskCanvas: HTMLCanvasElement;
  zoom: number;
  width: number;
  height: number;
}

export function drawMagicWandOverlay({
  ctx,
  selection,
  selectionMaskCanvas,
  zoom,
  width,
  height,
}: DrawMagicWandOverlayParams): void {
  const dashCycle = MAGIC_WAND_OUTLINE_DASH.reduce((sum, value) => sum + value, 0);
  const antsOffset = dashCycle > 0
    ? -((performance.now() / MAGIC_WAND_OUTLINE_SPEED_MS) % dashCycle)
    : 0;

  ctx.save();
  ctx.globalAlpha = MAGIC_WAND_OVERLAY_ALPHA;
  ctx.drawImage(selectionMaskCanvas, 0, 0, width, height);
  ctx.restore();

  drawMagicWandSelectionOutline(ctx, selection, {
    zoom,
    color: "rgba(0, 0, 0, 0.9)",
    lineWidth: 2,
    dash: MAGIC_WAND_OUTLINE_DASH,
    dashOffset: antsOffset,
  });
  drawMagicWandSelectionOutline(ctx, selection, {
    zoom,
    color: "rgba(255, 255, 255, 0.95)",
    lineWidth: 1,
    dash: MAGIC_WAND_OUTLINE_DASH,
    dashOffset: antsOffset + (dashCycle / 2),
  });
}
