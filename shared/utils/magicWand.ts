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
  ignoreAlpha?: boolean;
  colorMetric?: "rgba" | "hsv";
}

export interface MagicWandColorSelectionOptions {
  tolerance?: number;
}

export interface MagicWandColorComponentSelectionOptions {
  tolerance?: number;
  connectedOnly?: boolean;
}

export interface MagicWandAlphaSelectionOptions {
  alphaThreshold?: number;
  connectedOnly?: boolean;
}

export interface MagicWandMaskCanvasOptions {
  feather?: number;
}

export interface MagicWandBoundsMask {
  x: number;
  y: number;
  width: number;
  height: number;
  mask: Uint8Array;
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

interface HsvPixel {
  h: number;
  s: number;
  v: number;
}

const DEFAULT_TOLERANCE = 24;
const DEFAULT_ALPHA_THRESHOLD = 16;
const MAX_FEATHER = 32;

const DEFAULT_COLOR_SELECTION_OPTIONS: Omit<MagicWandSelectionOptions, "tolerance"> = {
  connectedOnly: true,
  ignoreAlpha: true,
  colorMetric: "hsv",
};

function clampTolerance(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_TOLERANCE;
  return Math.max(0, Math.min(255, Math.round(value as number)));
}

function clampFeather(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(MAX_FEATHER, value as number));
  return Math.round(clamped * 2) / 2;
}

function clampAlphaThreshold(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_ALPHA_THRESHOLD;
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

function rgbToHsv(r: number, g: number, b: number): HsvPixel {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

function hueDistanceNormalized(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 360 - diff) / 180;
}

function isWithinColorToleranceHsv(
  data: Uint8ClampedArray,
  index: number,
  seedHsv: HsvPixel,
  tolerance: number,
): boolean {
  const offset = index * 4;
  const hsv = rgbToHsv(data[offset], data[offset + 1], data[offset + 2]);

  const normalizedTolerance = tolerance / 255;
  const hueLimit = Math.min(1, normalizedTolerance * 1.8 + 0.02);
  const satLimit = Math.min(1, normalizedTolerance * 1.35 + 0.02);
  const valueLimit = Math.min(1, normalizedTolerance * 3 + 0.05);

  const satDiff = Math.abs(hsv.s - seedHsv.s);
  const valueDiff = Math.abs(hsv.v - seedHsv.v);

  // If either side is near-neutral (gray/white/black), hue is unstable.
  // In this case require tight saturation/value similarity.
  if (seedHsv.s < 0.06 || hsv.s < 0.06) {
    return satDiff <= satLimit * 0.75 && valueDiff <= valueLimit;
  }

  const hueDiff = hueDistanceNormalized(hsv.h, seedHsv.h);
  return hueDiff <= hueLimit && satDiff <= satLimit && valueDiff <= valueLimit;
}

function isWithinTolerance(
  data: Uint8ClampedArray,
  index: number,
  seed: RgbaPixel,
  tolerance: number,
  options: MagicWandSelectionOptions | undefined,
  seedHsv: HsvPixel | null,
): boolean {
  if (options?.colorMetric === "hsv" && seedHsv) {
    return isWithinColorToleranceHsv(data, index, seedHsv, tolerance);
  }

  const offset = index * 4;
  const ignoreAlpha = options?.ignoreAlpha === true;
  return (
    Math.abs(data[offset] - seed.r) <= tolerance
    && Math.abs(data[offset + 1] - seed.g) <= tolerance
    && Math.abs(data[offset + 2] - seed.b) <= tolerance
    && (ignoreAlpha || Math.abs(data[offset + 3] - seed.a) <= tolerance)
  );
}

function computeColorComponentMaskAlpha(
  data: Uint8ClampedArray,
  index: number,
  seed: RgbaPixel,
  tolerance: number,
  skipThreshold: boolean = false,
): number {
  const offset = index * 4;
  const pixelAlpha = data[offset + 3];
  if (pixelAlpha <= 0) return 0;

  let activeChannelCount = 0;
  let minComponentRatio = 1;

  if (seed.r > 0) {
    activeChannelCount += 1;
    minComponentRatio = Math.min(minComponentRatio, data[offset] / seed.r);
  }
  if (seed.g > 0) {
    activeChannelCount += 1;
    minComponentRatio = Math.min(minComponentRatio, data[offset + 1] / seed.g);
  }
  if (seed.b > 0) {
    activeChannelCount += 1;
    minComponentRatio = Math.min(minComponentRatio, data[offset + 2] / seed.b);
  }

  if (activeChannelCount <= 0 || minComponentRatio <= 0) {
    return 0;
  }

  let impuritySum = 0;
  const inactiveChannelCount = 3 - activeChannelCount;
  if (seed.r <= 0) impuritySum += data[offset] / 255;
  if (seed.g <= 0) impuritySum += data[offset + 1] / 255;
  if (seed.b <= 0) impuritySum += data[offset + 2] / 255;

  const impurityRatio = inactiveChannelCount > 0
    ? impuritySum / inactiveChannelCount
    : 0;
  const purity = Math.max(0, 1 - impurityRatio);
  const componentRatio = Math.max(0, Math.min(1, minComponentRatio)) * purity;
  if (componentRatio <= 0) return 0;

  const maskAlpha = Math.max(1, Math.min(255, Math.round(componentRatio * pixelAlpha)));
  if (skipThreshold) return maskAlpha;

  const minMaskAlpha = Math.max(8, Math.round((255 - tolerance) * 0.2));
  return maskAlpha >= minMaskAlpha ? maskAlpha : 0;
}

function toBounds(minX: number, minY: number, maxX: number, maxY: number): MagicWandSelectionBounds {
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function getDefaultMagicWandColorSelectionOptions(
  options?: MagicWandColorSelectionOptions,
): MagicWandSelectionOptions {
  return {
    ...DEFAULT_COLOR_SELECTION_OPTIONS,
    tolerance: options?.tolerance,
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
  const seedHsv = options?.colorMetric === "hsv"
    ? rgbToHsv(seedPixel.r, seedPixel.g, seedPixel.b)
    : null;

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
      if (!isWithinTolerance(data, index, seedPixel, tolerance, options, seedHsv)) {
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
      if (!isWithinTolerance(data, index, seedPixel, tolerance, options, seedHsv)) {
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

export function computeMagicWandColorSelection(
  imageData: ImageData,
  seedX: number,
  seedY: number,
  options?: MagicWandColorSelectionOptions,
): MagicWandSelection | null {
  return computeMagicWandSelection(
    imageData,
    seedX,
    seedY,
    getDefaultMagicWandColorSelectionOptions(options),
  );
}

export function computeMagicWandColorComponentSelection(
  imageData: ImageData,
  seedX: number,
  seedY: number,
  options?: MagicWandColorComponentSelectionOptions,
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
  const isNearBlackSeed = seedPixel.r <= 2 && seedPixel.g <= 2 && seedPixel.b <= 2;

  if (isNearBlackSeed) {
    return computeMagicWandColorSelection(imageData, seedX, seedY, { tolerance: options?.tolerance });
  }

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
      const maskAlpha = computeColorComponentMaskAlpha(
        data,
        index,
        seedPixel,
        tolerance,
        index === seedIndex,
      );

      if (maskAlpha <= 0) {
        continue;
      }

      if (mask[index] > 0) {
        continue;
      }

      mask[index] = maskAlpha;
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
    for (let index = 0; index < total; index += 1) {
      const maskAlpha = computeColorComponentMaskAlpha(
        data,
        index,
        seedPixel,
        tolerance,
        index === seedIndex,
      );
      if (maskAlpha <= 0) continue;

      mask[index] = maskAlpha;
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

export function computeMagicWandSelectionFromAlphaMask(
  imageData: ImageData,
  seedX: number,
  seedY: number,
  options?: MagicWandAlphaSelectionOptions,
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

  const alphaThreshold = clampAlphaThreshold(options?.alphaThreshold);
  const connectedOnly = options?.connectedOnly !== false;
  const data = imageData.data;
  const seedIndex = y * width + x;
  const seedIsOpaque = data[seedIndex * 4 + 3] > alphaThreshold;

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
      const isOpaque = data[index * 4 + 3] > alphaThreshold;
      if (isOpaque !== seedIsOpaque) {
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
      const isOpaque = data[index * 4 + 3] > alphaThreshold;
      if (isOpaque !== seedIsOpaque) {
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

export function createMagicWandMaskCanvas(
  selection: MagicWandSelection,
  options?: MagicWandMaskCanvasOptions,
): HTMLCanvasElement {
  const { width, height, mask } = selection;
  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = width;
  baseCanvas.height = height;

  const baseCtx = baseCanvas.getContext("2d");
  if (!baseCtx) {
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

  baseCtx.putImageData(new ImageData(pixels, width, height), 0, 0);

  const feather = clampFeather(options?.feather);
  if (feather <= 0) {
    return baseCanvas;
  }

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;

  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) {
    return baseCanvas;
  }

  outputCtx.filter = `blur(${feather}px)`;
  outputCtx.drawImage(baseCanvas, 0, 0);
  outputCtx.filter = "none";
  return outputCanvas;
}

export function toMagicWandBoundsMask(selection: MagicWandSelection): MagicWandBoundsMask {
  const { bounds } = selection;
  const localMask = new Uint8Array(bounds.width * bounds.height);

  for (let y = 0; y < bounds.height; y += 1) {
    const srcStart = (bounds.y + y) * selection.width + bounds.x;
    const srcEnd = srcStart + bounds.width;
    localMask.set(selection.mask.subarray(srcStart, srcEnd), y * bounds.width);
  }

  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    mask: localMask,
  };
}

/**
 * 4-connected 컴포넌트로 마스크를 나누어 각 영역의 바운드 + 서브마스크 반환.
 * 여러 선택(추가 모드)이 하나의 bbox로 합쳐져도 영역별로 점선을 그리기 위함.
 */
function getConnectedComponents(
  width: number,
  height: number,
  mask: Uint8Array,
): Array<{ x: number; y: number; width: number; height: number; mask: Uint8Array }> {
  const visited = new Uint8Array(mask.length);
  const components: Array<{ minX: number; minY: number; maxX: number; maxY: number; pixels: number[] }> = [];

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] <= 0 || visited[i]) continue;
    const pixels: number[] = [];
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const stack: number[] = [i];
    visited[i] = 1;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = Math.floor(idx / width);
      pixels.push(idx);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      const left = idx - 1;
      const right = idx + 1;
      const top = idx - width;
      const bottom = idx + width;
      if (x > 0 && mask[left] > 0 && !visited[left]) { visited[left] = 1; stack.push(left); }
      if (x < width - 1 && mask[right] > 0 && !visited[right]) { visited[right] = 1; stack.push(right); }
      if (y > 0 && mask[top] > 0 && !visited[top]) { visited[top] = 1; stack.push(top); }
      if (y < height - 1 && mask[bottom] > 0 && !visited[bottom]) { visited[bottom] = 1; stack.push(bottom); }
    }
    if (pixels.length > 0) {
      components.push({ minX, minY, maxX, maxY, pixels });
    }
  }

  return components.map((c) => {
    const cw = c.maxX - c.minX + 1;
    const ch = c.maxY - c.minY + 1;
    const sub = new Uint8Array(cw * ch);
    for (const idx of c.pixels) {
      const x = idx % width - c.minX;
      const y = Math.floor(idx / width) - c.minY;
      sub[y * cw + x] = 255;
    }
    return { x: c.minX, y: c.minY, width: cw, height: ch, mask: sub };
  });
}

/**
 * 마스크를 연결 요소별로 나누어 각 영역만 점선으로 그림.
 * 여러 선택이 하나의 bbox로 합쳐진 경우에도 각 영역이 따로 점선으로 보이게 함.
 */
export function drawMagicWandSelectionOutlineByComponents(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mask: Uint8Array,
  options?: MagicWandOutlineOptions & { offsetX?: number; offsetY?: number },
): void {
  const components = getConnectedComponents(width, height, mask);
  const offsetX = options?.offsetX ?? 0;
  const offsetY = options?.offsetY ?? 0;
  for (const comp of components) {
    const selection: MagicWandSelection = {
      width: comp.width,
      height: comp.height,
      mask: comp.mask,
      selectedCount: 0,
      bounds: { x: 0, y: 0, width: comp.width, height: comp.height },
    };
    drawMagicWandSelectionOutline(ctx, selection, {
      ...options,
      offsetX: offsetX + comp.x * (options?.zoom ?? 1),
      offsetY: offsetY + comp.y * (options?.zoom ?? 1),
    });
  }
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

  const dash = options?.dash ?? [4, 4];
  const dashLength = dash.length > 0 ? Math.max(1, dash[0]) : 4;
  const dashGap = dash.length > 1 ? Math.max(1, dash[1]) : dashLength;
  const dashCycle = dashLength + dashGap;
  const dashOffset = Number.isFinite(options?.dashOffset) ? (options?.dashOffset as number) : 0;
  const strokeColor = options?.color ?? "rgba(34, 197, 94, 0.95)";
  const paintedPixels = new Set<string>();
  let hasSegments = false;

  const positiveModulo = (value: number, mod: number) => ((value % mod) + mod) % mod;

  const paintHorizontalSegment = (startX: number, endX: number, y: number) => {
    const minScreenX = Math.floor(Math.min(startX, endX));
    const maxScreenX = Math.ceil(Math.max(startX, endX));
    const screenY = Math.round(y);

    for (let screenX = minScreenX; screenX < maxScreenX; screenX += 1) {
      const phase = positiveModulo(screenX + dashOffset, dashCycle);
      if (phase >= dashLength) continue;
      const key = `${screenX}:${screenY}`;
      if (paintedPixels.has(key)) continue;
      paintedPixels.add(key);
      ctx.fillRect(screenX, screenY, 1, 1);
      hasSegments = true;
    }
  };

  const paintVerticalSegment = (x: number, startY: number, endY: number) => {
    const minScreenY = Math.floor(Math.min(startY, endY));
    const maxScreenY = Math.ceil(Math.max(startY, endY));
    const screenX = Math.round(x);

    for (let screenY = minScreenY; screenY < maxScreenY; screenY += 1) {
      const phase = positiveModulo(screenY + dashOffset, dashCycle);
      if (phase >= dashLength) continue;
      const key = `${screenX}:${screenY}`;
      if (paintedPixels.has(key)) continue;
      paintedPixels.add(key);
      ctx.fillRect(screenX, screenY, 1, 1);
      hasSegments = true;
    }
  };

  ctx.save();
  ctx.fillStyle = strokeColor;
  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * width;
    for (let x = minX; x <= maxX; x++) {
      const index = rowOffset + x;
      if (mask[index] <= 0) {
        continue;
      }

      const hasLeft = x > 0 && mask[index - 1] > 0;
      const hasRight = x < width - 1 && mask[index + 1] > 0;
      const hasTop = y > 0 && mask[index - width] > 0;
      const hasBottom = y < height - 1 && mask[index + width] > 0;

      const px = offsetX + x * zoom;
      const py = offsetY + y * zoom;
      const pxNext = px + zoom;
      const pyNext = py + zoom;

      if (!hasTop) {
        paintHorizontalSegment(px, pxNext, py);
      }
      if (!hasRight) {
        paintVerticalSegment(pxNext, py, pyNext);
      }
      if (!hasBottom) {
        paintHorizontalSegment(px, pxNext, pyNext);
      }
      if (!hasLeft) {
        paintVerticalSegment(px, py, pyNext);
      }
    }
  }
  ctx.restore();

  if (!hasSegments) {
    return;
  }
}

export function isMagicWandPixelSelected(selection: MagicWandSelection, x: number, y: number): boolean {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= selection.width || py >= selection.height) {
    return false;
  }
  return selection.mask[py * selection.width + px] > 0;
}
