interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpriteCropOverlayColors {
  overlay: string;
  selection: string;
  grid?: string;
  textOnColor: string;
}

interface DrawSpriteCropOverlayOptions {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  cropArea: RectLike | null;
  colors: SpriteCropOverlayColors;
}

function getEightResizeHandles(x: number, y: number, width: number, height: number): Array<{ x: number; y: number }> {
  return [
    { x, y },
    { x: x + width / 2, y },
    { x: x + width, y },
    { x: x + width, y: y + height / 2 },
    { x: x + width, y: y + height },
    { x: x + width / 2, y: y + height },
    { x, y: y + height },
    { x, y: y + height / 2 },
  ];
}

export function drawSpriteCropOverlay({
  ctx,
  zoom,
  canvasWidth,
  canvasHeight,
  sourceWidth,
  sourceHeight,
  cropArea,
  colors,
}: DrawSpriteCropOverlayOptions): void {
  const activeCrop = cropArea || {
    x: 0,
    y: 0,
    width: sourceWidth,
    height: sourceHeight,
  };
  const cropX = activeCrop.x * zoom;
  const cropY = activeCrop.y * zoom;
  const cropW = activeCrop.width * zoom;
  const cropH = activeCrop.height * zoom;

  ctx.save();
  ctx.fillStyle = colors.overlay;
  ctx.fillRect(0, 0, canvasWidth, Math.max(0, cropY));
  ctx.fillRect(0, cropY + cropH, canvasWidth, Math.max(0, canvasHeight - (cropY + cropH)));
  ctx.fillRect(0, cropY, Math.max(0, cropX), cropH);
  ctx.fillRect(cropX + cropW, cropY, Math.max(0, canvasWidth - (cropX + cropW)), cropH);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = colors.selection;
  ctx.lineWidth = 2;
  ctx.strokeRect(cropX, cropY, cropW, cropH);

  ctx.strokeStyle = colors.grid || "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(cropX + (cropW * i) / 3, cropY);
    ctx.lineTo(cropX + (cropW * i) / 3, cropY + cropH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cropX, cropY + (cropH * i) / 3);
    ctx.lineTo(cropX + cropW, cropY + (cropH * i) / 3);
    ctx.stroke();
  }

  const handleSize = 10;
  const handles = getEightResizeHandles(cropX, cropY, cropW, cropH);
  ctx.fillStyle = colors.selection;
  ctx.strokeStyle = colors.textOnColor;
  for (const handle of handles) {
    ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
  }
  ctx.restore();
}
