"use client";

interface PointLike {
  x: number;
  y: number;
}

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropOverlayColors {
  selection: string;
  overlay: string;
  grid?: string;
}

interface TransformOverlayColors {
  selection: string;
  textOnColor: string;
}

interface DrawCropOverlayOptions {
  ctx: CanvasRenderingContext2D;
  activeCrop: RectLike;
  scale: number;
  offsetX: number;
  offsetY: number;
  previewWidth: number;
  previewHeight: number;
  colors: CropOverlayColors;
  contentToScreen: (point: PointLike) => PointLike;
}

interface DrawTransformBoundsOptions {
  ctx: CanvasRenderingContext2D;
  bounds: RectLike;
  scale: number;
  colors: TransformOverlayColors;
  contentToScreen: (point: PointLike) => PointLike;
}

interface DrawMaskRegionOverlayOptions {
  ctx: CanvasRenderingContext2D;
  region: RectLike;
  isDragging: boolean;
  scale: number;
  contentToScreen: (point: PointLike) => PointLike;
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

export function drawCropOverlay({
  ctx,
  activeCrop,
  scale,
  offsetX,
  offsetY,
  previewWidth,
  previewHeight,
  colors,
  contentToScreen,
}: DrawCropOverlayOptions): void {
  const cropPoint = contentToScreen({ x: activeCrop.x, y: activeCrop.y });
  const cropX = cropPoint.x;
  const cropY = cropPoint.y;
  const cropW = activeCrop.width * scale;
  const cropH = activeCrop.height * scale;

  ctx.save();
  ctx.fillStyle = colors.overlay;
  ctx.fillRect(offsetX, offsetY, previewWidth, cropY - offsetY);
  ctx.fillRect(offsetX, cropY + cropH, previewWidth, (offsetY + previewHeight) - (cropY + cropH));
  ctx.fillRect(offsetX, cropY, cropX - offsetX, cropH);
  ctx.fillRect(cropX + cropW, cropY, (offsetX + previewWidth) - (cropX + cropW), cropH);
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
  for (const handle of handles) {
    ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
  }
  ctx.restore();
}

export function drawTransformBoundsOverlay({
  ctx,
  bounds,
  scale,
  colors,
  contentToScreen,
}: DrawTransformBoundsOptions): void {
  const topLeft = contentToScreen({ x: bounds.x, y: bounds.y });
  const transformX = topLeft.x;
  const transformY = topLeft.y;
  const transformW = bounds.width * scale;
  const transformH = bounds.height * scale;

  ctx.save();
  ctx.strokeStyle = colors.selection;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(transformX, transformY, transformW, transformH);

  const handleSize = 10;
  const handles = getEightResizeHandles(transformX, transformY, transformW, transformH);

  ctx.fillStyle = colors.selection;
  ctx.strokeStyle = colors.textOnColor;
  ctx.lineWidth = 1;
  for (const handle of handles) {
    ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
  }
  ctx.restore();
}

export function drawMaskRegionOverlay({
  ctx,
  region,
  isDragging,
  scale,
  contentToScreen,
}: DrawMaskRegionOverlayOptions): void {
  const regionTopLeft = contentToScreen({ x: region.x, y: region.y });
  const rectX = regionTopLeft.x;
  const rectY = regionTopLeft.y;
  const rectW = region.width * scale;
  const rectH = region.height * scale;

  ctx.save();
  ctx.fillStyle = isDragging ? "rgba(59, 130, 246, 0.16)" : "rgba(59, 130, 246, 0.08)";
  ctx.strokeStyle = "rgba(147, 197, 253, 0.95)";
  ctx.lineWidth = isDragging ? 1.75 : 1.25;
  ctx.setLineDash(isDragging ? [8, 4] : [6, 6]);
  ctx.fillRect(rectX, rectY, rectW, rectH);
  ctx.strokeRect(rectX, rectY, rectW, rectH);
  ctx.restore();
}
