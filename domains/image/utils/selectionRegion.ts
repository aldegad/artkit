import type { CropArea, Point, SelectionMask } from "../types";
import { clearRectWithFeather } from "./selectionFeather";

function roundSelectionArea(selection: CropArea): CropArea {
  return {
    x: Math.round(selection.x),
    y: Math.round(selection.y),
    width: Math.max(1, Math.round(selection.width)),
    height: Math.max(1, Math.round(selection.height)),
  };
}

export function isPointInsideSelection(
  point: Point,
  selection: CropArea | null,
  selectionMask: SelectionMask | null
): boolean {
  if (!selection) return false;

  if (
    point.x < selection.x
    || point.x > selection.x + selection.width
    || point.y < selection.y
    || point.y > selection.y + selection.height
  ) {
    return false;
  }

  if (!selectionMask) return true;

  const px = Math.floor(point.x) - selectionMask.x;
  const py = Math.floor(point.y) - selectionMask.y;
  if (px < 0 || py < 0 || px >= selectionMask.width || py >= selectionMask.height) {
    return false;
  }

  return selectionMask.mask[py * selectionMask.width + px] > 0;
}

export function createSelectionMaskFromPath(path: Point[]): SelectionMask | null {
  if (path.length < 3) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of path) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  const x = Math.floor(minX);
  const y = Math.floor(minY);
  const width = Math.max(1, Math.ceil(maxX) - x + 1);
  const height = Math.max(1, Math.ceil(maxY) - y + 1);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return null;

  maskCtx.clearRect(0, 0, width, height);
  maskCtx.fillStyle = "#ffffff";
  maskCtx.beginPath();
  path.forEach((point, index) => {
    const localX = point.x - x;
    const localY = point.y - y;
    if (index === 0) {
      maskCtx.moveTo(localX, localY);
    } else {
      maskCtx.lineTo(localX, localY);
    }
  });
  maskCtx.closePath();
  maskCtx.fill();

  const alphaData = maskCtx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  let selectedCount = 0;

  for (let i = 0; i < mask.length; i += 1) {
    const alpha = alphaData[i * 4 + 3];
    if (alpha > 0) {
      mask[i] = 255;
      selectedCount += 1;
    }
  }

  if (selectedCount === 0) return null;

  return {
    x,
    y,
    width,
    height,
    mask,
  };
}

export function applySelectionMaskToImageData(
  imageData: ImageData,
  selection: CropArea,
  selectionMask: SelectionMask | null
): ImageData {
  if (!selectionMask) return imageData;

  const roundedSelection = roundSelectionArea(selection);
  const offsetX = roundedSelection.x - selectionMask.x;
  const offsetY = roundedSelection.y - selectionMask.y;

  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const maskX = x + offsetX;
      const maskY = y + offsetY;
      const isSelected = (
        maskX >= 0
        && maskY >= 0
        && maskX < selectionMask.width
        && maskY < selectionMask.height
        && selectionMask.mask[maskY * selectionMask.width + maskX] > 0
      );

      if (!isSelected) {
        const pixelIndex = (y * width + x) * 4;
        data[pixelIndex] = 0;
        data[pixelIndex + 1] = 0;
        data[pixelIndex + 2] = 0;
        data[pixelIndex + 3] = 0;
      }
    }
  }

  return imageData;
}

interface ClearSelectionOptions {
  selectionMask: SelectionMask | null;
  selectionFeather: number;
  layerOffset: { x: number; y: number };
}

export function clearSelectionFromLayer(
  ctx: CanvasRenderingContext2D,
  selection: CropArea,
  options: ClearSelectionOptions
): void {
  const { selectionMask, selectionFeather, layerOffset } = options;
  const roundedSelection = roundSelectionArea(selection);

  if (!selectionMask) {
    const localX = roundedSelection.x - layerOffset.x;
    const localY = roundedSelection.y - layerOffset.y;
    clearRectWithFeather(
      ctx,
      localX,
      localY,
      roundedSelection.width,
      roundedSelection.height,
      selectionFeather
    );
    return;
  }

  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  const layerGlobalX = layerOffset.x;
  const layerGlobalY = layerOffset.y;

  const globalMinX = Math.max(selectionMask.x, layerGlobalX);
  const globalMinY = Math.max(selectionMask.y, layerGlobalY);
  const globalMaxX = Math.min(selectionMask.x + selectionMask.width, layerGlobalX + canvasWidth);
  const globalMaxY = Math.min(selectionMask.y + selectionMask.height, layerGlobalY + canvasHeight);

  if (globalMinX >= globalMaxX || globalMinY >= globalMaxY) {
    return;
  }

  const localX = globalMinX - layerGlobalX;
  const localY = globalMinY - layerGlobalY;
  const width = globalMaxX - globalMinX;
  const height = globalMaxY - globalMinY;
  const imageData = ctx.getImageData(localX, localY, width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y += 1) {
    const maskY = globalMinY + y - selectionMask.y;
    for (let x = 0; x < width; x += 1) {
      const maskX = globalMinX + x - selectionMask.x;
      if (selectionMask.mask[maskY * selectionMask.width + maskX] === 0) continue;

      const pixelIndex = (y * width + x) * 4;
      data[pixelIndex] = 0;
      data[pixelIndex + 1] = 0;
      data[pixelIndex + 2] = 0;
      data[pixelIndex + 3] = 0;
    }
  }

  ctx.putImageData(imageData, localX, localY);
}

export function translateSelectionMask(
  selectionMask: SelectionMask | null,
  nextX: number,
  nextY: number
): SelectionMask | null {
  if (!selectionMask) return null;
  return {
    ...selectionMask,
    x: Math.round(nextX),
    y: Math.round(nextY),
  };
}
