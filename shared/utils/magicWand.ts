export interface MagicWandSelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MagicWandSelection {
  width: number;
  height: number;
  mask: Uint8Array;
  selectedCount: number;
  bounds: MagicWandSelectionBounds;
}

export interface MagicWandSelectionOptions {
  tolerance?: number;
  connectedOnly?: boolean;
}

export interface MagicWandOutlineOptions {
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  color?: string;
  lineWidth?: number;
  dash?: number[];
  dashOffset?: number;
}

interface RgbaPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

const DEFAULT_TOLERANCE = 24;

function clampTolerance(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_TOLERANCE;
  return Math.max(0, Math.min(255, Math.round(value as number)));
}

function getPixel(data: Uint8ClampedArray, index: number): RgbaPixel {
  const offset = index * 4;
  return {
    r: data[offset],
    g: data[offset + 1],
    b: data[offset + 2],
    a: data[offset + 3],
  };
}

function isWithinTolerance(data: Uint8ClampedArray, index: number, seed: RgbaPixel, tolerance: number): boolean {
  const offset = index * 4;
  return (
    Math.abs(data[offset] - seed.r) <= tolerance
    && Math.abs(data[offset + 1] - seed.g) <= tolerance
    && Math.abs(data[offset + 2] - seed.b) <= tolerance
    && Math.abs(data[offset + 3] - seed.a) <= tolerance
  );
}

function toBounds(minX: number, minY: number, maxX: number, maxY: number): MagicWandSelectionBounds {
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function computeMagicWandSelection(
  imageData: ImageData,
  seedX: number,
  seedY: number,
  options?: MagicWandSelectionOptions,
): MagicWandSelection | null {
  const width = imageData.width;
  const height = imageData.height;
  const total = width * height;

  if (width <= 0 || height <= 0 || total <= 0) {
    return null;
  }

  const x = Math.floor(seedX);
  const y = Math.floor(seedY);
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return null;
  }

  const tolerance = clampTolerance(options?.tolerance);
  const connectedOnly = options?.connectedOnly !== false;
  const data = imageData.data;
  const seedIndex = y * width + x;
  const seedPixel = getPixel(data, seedIndex);

  const mask = new Uint8Array(total);
  let selectedCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  if (connectedOnly) {
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    visited[seedIndex] = 1;
    queue[tail++] = seedIndex;

    while (head < tail) {
      const index = queue[head++];
      if (!isWithinTolerance(data, index, seedPixel, tolerance)) {
        continue;
      }

      if (mask[index] === 255) {
        continue;
      }

      mask[index] = 255;
      selectedCount += 1;

      const px = index % width;
      const py = Math.floor(index / width);

      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;

      const left = index - 1;
      const right = index + 1;
      const top = index - width;
      const bottom = index + width;

      if (px > 0 && visited[left] === 0) {
        visited[left] = 1;
        queue[tail++] = left;
      }
      if (px < width - 1 && visited[right] === 0) {
        visited[right] = 1;
        queue[tail++] = right;
      }
      if (py > 0 && visited[top] === 0) {
        visited[top] = 1;
        queue[tail++] = top;
      }
      if (py < height - 1 && visited[bottom] === 0) {
        visited[bottom] = 1;
        queue[tail++] = bottom;
      }
    }
  } else {
    for (let index = 0; index < total; index++) {
      if (!isWithinTolerance(data, index, seedPixel, tolerance)) {
        continue;
      }

      mask[index] = 255;
      selectedCount += 1;

      const px = index % width;
      const py = Math.floor(index / width);

      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }

  if (selectedCount <= 0 || maxX < minX || maxY < minY) {
    return null;
  }

  return {
    width,
    height,
    mask,
    selectedCount,
    bounds: toBounds(minX, minY, maxX, maxY),
  };
}

export function createMagicWandMaskCanvas(selection: MagicWandSelection): HTMLCanvasElement {
  const { width, height, mask } = selection;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create magic wand mask canvas.");
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0) continue;
    const offset = i * 4;
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = 255;
  }

  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas;
}

export function drawMagicWandSelectionOutline(
  ctx: CanvasRenderingContext2D,
  selection: MagicWandSelection,
  options?: MagicWandOutlineOptions,
): void {
  const zoom = options?.zoom ?? 1;
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return;
  }

  const offsetX = options?.offsetX ?? 0;
  const offsetY = options?.offsetY ?? 0;
  const { width, height, mask, bounds } = selection;
  const minX = Math.max(0, bounds.x);
  const minY = Math.max(0, bounds.y);
  const maxX = Math.min(width - 1, bounds.x + bounds.width - 1);
  const maxY = Math.min(height - 1, bounds.y + bounds.height - 1);
  if (maxX < minX || maxY < minY) {
    return;
  }

  const path = new Path2D();
  let hasSegments = false;

  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * width;
    for (let x = minX; x <= maxX; x++) {
      const index = rowOffset + x;
      if (mask[index] !== 255) {
        continue;
      }

      const hasLeft = x > 0 && mask[index - 1] === 255;
      const hasRight = x < width - 1 && mask[index + 1] === 255;
      const hasTop = y > 0 && mask[index - width] === 255;
      const hasBottom = y < height - 1 && mask[index + width] === 255;

      const px = offsetX + x * zoom;
      const py = offsetY + y * zoom;
      const pxNext = px + zoom;
      const pyNext = py + zoom;

      if (!hasTop) {
        path.moveTo(px, py);
        path.lineTo(pxNext, py);
        hasSegments = true;
      }
      if (!hasRight) {
        path.moveTo(pxNext, py);
        path.lineTo(pxNext, pyNext);
        hasSegments = true;
      }
      if (!hasBottom) {
        path.moveTo(px, pyNext);
        path.lineTo(pxNext, pyNext);
        hasSegments = true;
      }
      if (!hasLeft) {
        path.moveTo(px, py);
        path.lineTo(px, pyNext);
        hasSegments = true;
      }
    }
  }

  if (!hasSegments) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = options?.color ?? "rgba(34, 197, 94, 0.95)";
  ctx.lineWidth = options?.lineWidth ?? Math.max(1, Math.min(2, zoom * 0.15));
  const dash = options?.dash ?? [4, 4];
  ctx.setLineDash(dash.length > 0 ? dash : []);
  ctx.lineDashOffset = Number.isFinite(options?.dashOffset) ? (options?.dashOffset as number) : 0;
  ctx.stroke(path);
  ctx.restore();
}

export function isMagicWandPixelSelected(selection: MagicWandSelection, x: number, y: number): boolean {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= selection.width || py >= selection.height) {
    return false;
  }
  return selection.mask[py * selection.width + px] === 255;
}
