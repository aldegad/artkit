const MAX_RESAMPLE_DIMENSION = 16384;
const RESAMPLE_SIZE_PATTERN = /^(\d+)\s*[x×]\s*(\d+)$/;
const RESAMPLE_PERCENT_PATTERN = /^(\d+(?:\.\d+)?)\s*%$/;

export interface ResampleSize {
  width: number;
  height: number;
}

export function clampResampleDimension(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_RESAMPLE_DIMENSION, Math.round(value)));
}

export function parseResampleInput(input: string, sourceSize: ResampleSize): ResampleSize {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("형식을 입력하세요. 예: 512x512 또는 50%");
  }

  const percentMatch = trimmed.match(RESAMPLE_PERCENT_PATTERN);
  if (percentMatch) {
    const percent = Number.parseFloat(percentMatch[1]);
    if (!Number.isFinite(percent) || percent <= 0) {
      throw new Error("퍼센트는 0보다 큰 숫자여야 합니다.");
    }
    return {
      width: clampResampleDimension((sourceSize.width * percent) / 100),
      height: clampResampleDimension((sourceSize.height * percent) / 100),
    };
  }

  const sizeMatch = trimmed.match(RESAMPLE_SIZE_PATTERN);
  if (sizeMatch) {
    const width = Number.parseInt(sizeMatch[1], 10);
    const height = Number.parseInt(sizeMatch[2], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error("가로/세로 값은 1 이상의 숫자여야 합니다.");
    }
    if (width > MAX_RESAMPLE_DIMENSION || height > MAX_RESAMPLE_DIMENSION) {
      throw new Error(`최대 해상도는 ${MAX_RESAMPLE_DIMENSION}x${MAX_RESAMPLE_DIMENSION} 입니다.`);
    }
    return { width, height };
  }

  const widthOnly = Number.parseInt(trimmed, 10);
  if (Number.isFinite(widthOnly) && widthOnly > 0) {
    const ratio = sourceSize.height / sourceSize.width;
    const width = clampResampleDimension(widthOnly);
    return {
      width,
      height: clampResampleDimension(width * ratio),
    };
  }

  throw new Error("형식은 512x512 또는 50% 입니다.");
}

export function loadImageFromSource(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });
}

function drawResampled(
  targetCtx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): void {
  const isDownscale = targetWidth < sourceWidth || targetHeight < sourceHeight;
  targetCtx.imageSmoothingEnabled = isDownscale;
  targetCtx.imageSmoothingQuality = isDownscale ? "high" : "low";
  targetCtx.clearRect(0, 0, targetWidth, targetHeight);
  targetCtx.drawImage(source, 0, 0, targetWidth, targetHeight);
}

export async function resampleImageDataByScale(
  imageData: string,
  scaleX: number,
  scaleY: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const image = await loadImageFromSource(imageData);
  const width = clampResampleDimension(image.width * scaleX);
  const height = clampResampleDimension(image.height * scaleY);

  if (width === image.width && height === image.height) {
    return { dataUrl: imageData, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2d context for resampling.");
  }

  drawResampled(ctx, image, image.width, image.height, width, height);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
  };
}

export function resampleCanvasByScale(
  sourceCanvas: HTMLCanvasElement,
  scaleX: number,
  scaleY: number,
): HTMLCanvasElement {
  const width = clampResampleDimension(sourceCanvas.width * scaleX);
  const height = clampResampleDimension(sourceCanvas.height * scaleY);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2d context for canvas resampling.");
  }

  drawResampled(ctx, sourceCanvas, sourceCanvas.width, sourceCanvas.height, width, height);
  return canvas;
}
