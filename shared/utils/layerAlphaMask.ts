// ============================================
// Layer Alpha Mask Utilities
// Non-destructive eraser support:
// - Keep source RGB in layer canvas
// - Accumulate alpha changes in a sidecar mask canvas
// ============================================

const layerMaskByCanvas = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

const maskDrawScratch: {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
} = {
  canvas: null,
  ctx: null,
};

function createOpaqueMaskCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const maskCtx = mask.getContext("2d");
  if (!maskCtx) return null;
  maskCtx.clearRect(0, 0, width, height);
  maskCtx.fillStyle = "rgba(255,255,255,1)";
  maskCtx.fillRect(0, 0, width, height);
  return mask;
}

function ensureMaskSize(mask: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement | null {
  if (mask.width === width && mask.height === height) return mask;
  const resized = createOpaqueMaskCanvas(width, height);
  if (!resized) return null;
  const resizedCtx = resized.getContext("2d");
  if (!resizedCtx) return null;
  resizedCtx.drawImage(mask, 0, 0);
  return resized;
}

function ensureMaskDrawScratch(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (
    !maskDrawScratch.canvas
    || !maskDrawScratch.ctx
    || maskDrawScratch.canvas.width !== width
    || maskDrawScratch.canvas.height !== height
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    maskDrawScratch.canvas = canvas;
    maskDrawScratch.ctx = ctx;
  }
  return maskDrawScratch.ctx;
}

export function getLayerAlphaMask(layerCanvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const existing = layerMaskByCanvas.get(layerCanvas);
  if (!existing) return null;
  const normalized = ensureMaskSize(existing, layerCanvas.width, layerCanvas.height);
  if (!normalized) return null;
  if (normalized !== existing) {
    layerMaskByCanvas.set(layerCanvas, normalized);
  }
  return normalized;
}

export function getLayerAlphaMaskContext(
  layerCanvas: HTMLCanvasElement,
  ensure: boolean = false
): CanvasRenderingContext2D | null {
  const mask = ensure ? ensureLayerAlphaMask(layerCanvas) : getLayerAlphaMask(layerCanvas);
  return mask?.getContext("2d") ?? null;
}

export function ensureLayerAlphaMask(layerCanvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const existing = getLayerAlphaMask(layerCanvas);
  if (existing) return existing;
  const created = createOpaqueMaskCanvas(layerCanvas.width, layerCanvas.height);
  if (!created) return null;
  layerMaskByCanvas.set(layerCanvas, created);
  return created;
}

export function fillLayerAlphaMaskRect(
  layerCanvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const maskCtx = getLayerAlphaMaskContext(layerCanvas);
  if (!maskCtx) return;
  maskCtx.fillStyle = "rgba(255,255,255,1)";
  maskCtx.fillRect(x, y, width, height);
}

export function drawIntoLayerAlphaMask(
  layerCanvas: HTMLCanvasElement,
  source: CanvasImageSource,
  x: number,
  y: number
): void {
  const maskCtx = getLayerAlphaMaskContext(layerCanvas);
  if (!maskCtx) return;
  maskCtx.drawImage(source, x, y);
}

export function clearLayerAlphaMask(layerCanvas: HTMLCanvasElement): void {
  layerMaskByCanvas.delete(layerCanvas);
}

export function copyLayerAlphaMask(
  sourceLayerCanvas: HTMLCanvasElement,
  targetLayerCanvas: HTMLCanvasElement
): void {
  const sourceMask = getLayerAlphaMask(sourceLayerCanvas);
  if (!sourceMask) {
    clearLayerAlphaMask(targetLayerCanvas);
    return;
  }
  const copied = createOpaqueMaskCanvas(targetLayerCanvas.width, targetLayerCanvas.height);
  if (!copied) return;
  const copiedCtx = copied.getContext("2d");
  if (!copiedCtx) return;
  copiedCtx.clearRect(0, 0, copied.width, copied.height);
  copiedCtx.drawImage(sourceMask, 0, 0, copied.width, copied.height);
  layerMaskByCanvas.set(targetLayerCanvas, copied);
}

export function rotateLayerAlphaMask(
  layerCanvas: HTMLCanvasElement,
  degrees: number
): void {
  const mask = getLayerAlphaMask(layerCanvas);
  if (!mask) return;

  const normalizedDeg = ((degrees % 360) + 360) % 360;
  const isSwapDimensions = normalizedDeg === 90 || normalizedDeg === 270;
  const oldWidth = mask.width;
  const oldHeight = mask.height;

  const temp = document.createElement("canvas");
  temp.width = oldWidth;
  temp.height = oldHeight;
  const tempCtx = temp.getContext("2d");
  if (!tempCtx) return;
  tempCtx.drawImage(mask, 0, 0);

  const newWidth = isSwapDimensions ? oldHeight : oldWidth;
  const newHeight = isSwapDimensions ? oldWidth : oldHeight;
  mask.width = newWidth;
  mask.height = newHeight;
  const maskCtx = mask.getContext("2d");
  if (!maskCtx) return;

  maskCtx.clearRect(0, 0, newWidth, newHeight);
  maskCtx.save();
  maskCtx.translate(newWidth / 2, newHeight / 2);
  maskCtx.rotate((normalizedDeg * Math.PI) / 180);
  maskCtx.drawImage(temp, -oldWidth / 2, -oldHeight / 2);
  maskCtx.restore();
}

export function drawLayerWithOptionalAlphaMask(
  targetCtx: CanvasRenderingContext2D,
  layerCanvas: HTMLCanvasElement,
  x: number,
  y: number
): void {
  const mask = getLayerAlphaMask(layerCanvas);
  if (!mask) {
    targetCtx.drawImage(layerCanvas, x, y);
    return;
  }

  const scratchCtx = ensureMaskDrawScratch(layerCanvas.width, layerCanvas.height);
  if (!scratchCtx || !maskDrawScratch.canvas) {
    targetCtx.drawImage(layerCanvas, x, y);
    return;
  }

  scratchCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
  scratchCtx.globalCompositeOperation = "source-over";
  scratchCtx.drawImage(layerCanvas, 0, 0);
  scratchCtx.globalCompositeOperation = "destination-in";
  scratchCtx.drawImage(mask, 0, 0);
  scratchCtx.globalCompositeOperation = "source-over";

  targetCtx.drawImage(maskDrawScratch.canvas, x, y);
}

export function getLayerAlphaMaskImageData(layerCanvas: HTMLCanvasElement): ImageData | null {
  const mask = getLayerAlphaMask(layerCanvas);
  if (!mask) return null;
  const maskCtx = mask.getContext("2d");
  if (!maskCtx) return null;
  return maskCtx.getImageData(0, 0, mask.width, mask.height);
}

export function setLayerAlphaMaskImageData(
  layerCanvas: HTMLCanvasElement,
  imageData: ImageData | null
): void {
  if (!imageData) {
    clearLayerAlphaMask(layerCanvas);
    return;
  }
  const mask = createOpaqueMaskCanvas(imageData.width, imageData.height);
  if (!mask) return;
  const maskCtx = mask.getContext("2d");
  if (!maskCtx) return;
  maskCtx.putImageData(imageData, 0, 0);
  layerMaskByCanvas.set(layerCanvas, mask);
}

export function getLayerAlphaMaskDataURL(layerCanvas: HTMLCanvasElement): string | undefined {
  const mask = getLayerAlphaMask(layerCanvas);
  if (!mask) return undefined;

  const maskCtx = mask.getContext("2d");
  if (!maskCtx) return undefined;

  const data = maskCtx.getImageData(0, 0, mask.width, mask.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      return mask.toDataURL("image/png");
    }
  }
  return undefined;
}

export function loadLayerAlphaMaskFromDataURL(
  layerCanvas: HTMLCanvasElement,
  dataUrl: string
): Promise<void> {
  return new Promise((resolve) => {
    const mask = createOpaqueMaskCanvas(layerCanvas.width, layerCanvas.height);
    const maskCtx = mask?.getContext("2d");
    if (!mask || !maskCtx) {
      resolve();
      return;
    }

    const img = new Image();
    img.onload = () => {
      maskCtx.clearRect(0, 0, mask.width, mask.height);
      maskCtx.drawImage(img, 0, 0, mask.width, mask.height);
      layerMaskByCanvas.set(layerCanvas, mask);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}
