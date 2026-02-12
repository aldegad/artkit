import type { SpriteTrack } from "../types";
import type { SpriteExportFrameSize } from "./export";

const MAX_RESAMPLE_DIMENSION = 16384;
const RESAMPLE_SIZE_PATTERN = /^(\d+)\s*[x×]\s*(\d+)$/;
const RESAMPLE_PERCENT_PATTERN = /^(\d+(?:\.\d+)?)\s*%$/;

export function clampResampleDimension(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_RESAMPLE_DIMENSION, Math.round(value)));
}

export function parseResampleInput(
  input: string,
  sourceSize: SpriteExportFrameSize,
): SpriteExportFrameSize {
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

function loadImageFromSource(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });
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

  const isDownscale = width < image.width || height < image.height;
  ctx.imageSmoothingEnabled = isDownscale;
  ctx.imageSmoothingQuality = isDownscale ? "high" : "low";
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
  };
}

export async function estimateCanvasSizeFromTracks(
  tracks: SpriteTrack[],
): Promise<SpriteExportFrameSize | null> {
  const frames = tracks.flatMap((track) => track.frames).filter((frame) => Boolean(frame.imageData));
  if (frames.length === 0) return null;

  const sizeCache = new Map<string, Promise<{ width: number; height: number } | null>>();
  const getImageSize = (dataUrl: string) => {
    const cached = sizeCache.get(dataUrl);
    if (cached) return cached;

    const promise = loadImageFromSource(dataUrl)
      .then((image) => ({ width: image.width, height: image.height }))
      .catch(() => null);
    sizeCache.set(dataUrl, promise);
    return promise;
  };

  let maxRight = 0;
  let maxBottom = 0;

  await Promise.all(
    frames.map(async (frame) => {
      if (!frame.imageData) return;
      const size = await getImageSize(frame.imageData);
      if (!size) return;
      const ox = frame.offset?.x ?? 0;
      const oy = frame.offset?.y ?? 0;
      maxRight = Math.max(maxRight, ox + size.width);
      maxBottom = Math.max(maxBottom, oy + size.height);
    }),
  );

  if (maxRight <= 0 || maxBottom <= 0) return null;
  return {
    width: clampResampleDimension(maxRight),
    height: clampResampleDimension(maxBottom),
  };
}
