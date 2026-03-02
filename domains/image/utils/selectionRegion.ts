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

export function createSelectionMaskFromRect(selection: CropArea): SelectionMask | null {
  const rounded = roundSelectionArea(selection);
  if (rounded.width <= 0 || rounded.height <= 0) return null;
  return {
    x: rounded.x,
    y: rounded.y,
    width: rounded.width,
    height: rounded.height,
    mask: new Uint8Array(rounded.width * rounded.height).fill(255),
  };
}

function applyMorphologyStep(
  source: Uint8Array,
  target: Uint8Array,
  width: number,
  height: number,
  mode: "expand" | "contract"
): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = mode === "expand" ? 0 : 255;
      for (let oy = -1; oy <= 1; oy += 1) {
        const ny = y + oy;
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const sample = (nx >= 0 && ny >= 0 && nx < width && ny < height)
            ? source[ny * width + nx]
            : 0;
          if (mode === "expand") {
            if (sample > value) value = sample;
          } else if (sample < value) {
            value = sample;
          }
        }
      }
      target[y * width + x] = value;
    }
  }
}

export function offsetSelectionMask(
  selectionMask: SelectionMask,
  offsetPx: number
): SelectionMask | null {
  if (!Number.isFinite(offsetPx) || offsetPx === 0) {
    return {
      ...selectionMask,
      mask: new Uint8Array(selectionMask.mask),
    };
  }

  const halfSteps = Math.round(offsetPx * 2);
  if (halfSteps === 0) {
    return {
      ...selectionMask,
      mask: new Uint8Array(selectionMask.mask),
    };
  }

  const stepCount = Math.abs(halfSteps);
  const mode = halfSteps > 0 ? "expand" : "contract";
  const scale = 2;
  const pad = Math.ceil(stepCount / scale) + 2;

  const paddedWidth = selectionMask.width + pad * 2;
  const paddedHeight = selectionMask.height + pad * 2;
  const upWidth = paddedWidth * scale;
  const upHeight = paddedHeight * scale;

  let upMask = new Uint8Array(upWidth * upHeight);
  for (let y = 0; y < selectionMask.height; y += 1) {
    for (let x = 0; x < selectionMask.width; x += 1) {
      const alpha = selectionMask.mask[y * selectionMask.width + x];
      if (alpha === 0) continue;

      const ux = (x + pad) * scale;
      const uy = (y + pad) * scale;
      const row0 = uy * upWidth + ux;
      const row1 = (uy + 1) * upWidth + ux;
      upMask[row0] = alpha;
      upMask[row0 + 1] = alpha;
      upMask[row1] = alpha;
      upMask[row1 + 1] = alpha;
    }
  }

  let scratch = new Uint8Array(upMask.length);
  for (let step = 0; step < stepCount; step += 1) {
    applyMorphologyStep(upMask, scratch, upWidth, upHeight, mode);
    const tmp = upMask;
    upMask = scratch;
    scratch = tmp;
  }

  const downMask = new Uint8Array(paddedWidth * paddedHeight);
  for (let y = 0; y < paddedHeight; y += 1) {
    for (let x = 0; x < paddedWidth; x += 1) {
      const ux = x * scale;
      const uy = y * scale;
      const idx0 = uy * upWidth + ux;
      const idx1 = idx0 + 1;
      const idx2 = idx0 + upWidth;
      const idx3 = idx2 + 1;
      downMask[y * paddedWidth + x] = Math.round(
        (upMask[idx0] + upMask[idx1] + upMask[idx2] + upMask[idx3]) / 4
      );
    }
  }

  let minX = paddedWidth;
  let minY = paddedHeight;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < paddedHeight; y += 1) {
    for (let x = 0; x < paddedWidth; x += 1) {
      if (downMask[y * paddedWidth + x] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const outWidth = maxX - minX + 1;
  const outHeight = maxY - minY + 1;
  const outMask = new Uint8Array(outWidth * outHeight);
  for (let y = 0; y < outHeight; y += 1) {
    const srcStart = (minY + y) * paddedWidth + minX;
    outMask.set(downMask.subarray(srcStart, srcStart + outWidth), y * outWidth);
  }

  return {
    x: selectionMask.x - pad + minX,
    y: selectionMask.y - pad + minY,
    width: outWidth,
    height: outHeight,
    mask: outMask,
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
      );
      const maskAlpha = isSelected ? selectionMask.mask[maskY * selectionMask.width + maskX] : 0;

      if (maskAlpha <= 0) {
        const pixelIndex = (y * width + x) * 4;
        data[pixelIndex] = 0;
        data[pixelIndex + 1] = 0;
        data[pixelIndex + 2] = 0;
        data[pixelIndex + 3] = 0;
      } else if (maskAlpha < 255) {
        const pixelIndex = (y * width + x) * 4;
        data[pixelIndex + 3] = Math.round((data[pixelIndex + 3] * maskAlpha) / 255);
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
      const maskAlpha = selectionMask.mask[maskY * selectionMask.width + maskX];
      if (maskAlpha <= 0) continue;

      const pixelIndex = (y * width + x) * 4;
      if (maskAlpha >= 255) {
        data[pixelIndex] = 0;
        data[pixelIndex + 1] = 0;
        data[pixelIndex + 2] = 0;
        data[pixelIndex + 3] = 0;
        continue;
      }
      const nextAlpha = Math.round(data[pixelIndex + 3] * (1 - maskAlpha / 255));
      data[pixelIndex + 3] = nextAlpha;
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
