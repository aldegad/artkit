import { UI } from "../../constants";
import { Clip, getClipSourceSpan } from "../../types";

const TILE_GAP_PX = 1;
const TILE_TARGET_WIDTH_PX = 42;
const TILE_MIN_WIDTH_PX = 28;
const TILE_MAX_COUNT = 20;
const VIDEO_FRAME_EPSILON = 1 / 60;
const VIDEO_EVENT_TIMEOUT_MS = 4000;
const THUMBNAIL_CACHE_LIMIT = 240;
const THUMBNAIL_BATCH_SIZE = 2;

export interface VideoThumbnailTile {
  key: string;
  width: number;
  sampleTime: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildThumbnailCacheKey(sourceUrl: string, sampleTime: number, targetHeight: number): string {
  return `${sourceUrl}::${sampleTime.toFixed(3)}::${targetHeight}`;
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "loadeddata" | "seeked"
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for video event: ${eventName}`));
    }, VIDEO_EVENT_TIMEOUT_MS);

    const handleResolve = () => {
      cleanup();
      resolve();
    };

    const handleReject = () => {
      cleanup();
      reject(new Error(`Video failed while waiting for event: ${eventName}`));
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener(eventName, handleResolve);
      video.removeEventListener("error", handleReject);
    };

    video.addEventListener(eventName, handleResolve, { once: true });
    video.addEventListener("error", handleReject, { once: true });
  });
}

async function ensureVideoFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }
  await waitForVideoEvent(video, "loadeddata");
}

async function ensureVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration)) {
    return;
  }
  await waitForVideoEvent(video, "loadedmetadata");
}

async function seekVideo(video: HTMLVideoElement, targetTime: number): Promise<void> {
  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    && Math.abs(video.currentTime - targetTime) <= VIDEO_FRAME_EPSILON
  ) {
    return;
  }
  const seekPromise = waitForVideoEvent(video, "seeked");
  video.currentTime = targetTime;
  await seekPromise;
}

const thumbnailCache = new Map<string, string | null>();
const thumbnailTouchedAt = new Map<string, number>();
const thumbnailVideoPool = new Map<string, HTMLVideoElement>();
const thumbnailCanvasPool = new Map<string, HTMLCanvasElement>();

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function touchThumbnailCacheKey(cacheKey: string) {
  thumbnailTouchedAt.set(cacheKey, nowMs());
}

function setThumbnailCacheValue(cacheKey: string, value: string | null) {
  thumbnailCache.set(cacheKey, value);
  touchThumbnailCacheKey(cacheKey);

  while (thumbnailCache.size > THUMBNAIL_CACHE_LIMIT) {
    let oldestKey: string | null = null;
    let oldestTouch = Number.POSITIVE_INFINITY;
    for (const key of thumbnailCache.keys()) {
      const touchedAt = thumbnailTouchedAt.get(key) ?? 0;
      if (touchedAt < oldestTouch) {
        oldestTouch = touchedAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    thumbnailCache.delete(oldestKey);
    thumbnailTouchedAt.delete(oldestKey);
  }
}

function getThumbnailVideo(sourceUrl: string): HTMLVideoElement {
  let video = thumbnailVideoPool.get(sourceUrl);
  if (!video) {
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.src = sourceUrl;
    thumbnailVideoPool.set(sourceUrl, video);
  }
  return video;
}

function getThumbnailCanvas(sourceUrl: string, width: number, height: number): HTMLCanvasElement {
  let canvas = thumbnailCanvasPool.get(sourceUrl);
  if (!canvas) {
    canvas = document.createElement("canvas");
    thumbnailCanvasPool.set(sourceUrl, canvas);
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to convert thumbnail blob to data URL"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read thumbnail blob"));
    reader.readAsDataURL(blob);
  });
}

async function encodeThumbnailCanvas(canvas: HTMLCanvasElement): Promise<string> {
  if (typeof canvas.toBlob === "function") {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.72);
    });
    if (blob) {
      return blobToDataUrl(blob);
    }
  }
  return canvas.toDataURL("image/jpeg", 0.72);
}

export function buildVideoThumbnailTiles(clip: Clip, visualWidth: number): VideoThumbnailTile[] {
  if (clip.type !== "video") return [];

  const safeVisualWidth = Number.isFinite(visualWidth) ? Math.max(0, Math.floor(visualWidth)) : 0;
  const availableWidth = Math.max(0, safeVisualWidth - 4);
  if (availableWidth < 16) return [];

  const maxCountByWidth = Math.max(
    1,
    Math.floor((availableWidth + TILE_GAP_PX) / (TILE_MIN_WIDTH_PX + TILE_GAP_PX))
  );
  const preferredCount = Math.max(
    1,
    Math.round((availableWidth + TILE_GAP_PX) / (TILE_TARGET_WIDTH_PX + TILE_GAP_PX))
  );
  const tileCount = Math.min(TILE_MAX_COUNT, Math.min(maxCountByWidth, preferredCount));
  const totalGapWidth = TILE_GAP_PX * Math.max(0, tileCount - 1);
  const usableWidth = Math.max(tileCount, availableWidth - totalGapWidth);
  const baseWidth = Math.floor(usableWidth / tileCount);
  const widthRemainder = usableWidth - (baseWidth * tileCount);
  const sourceSpan = Math.max(0, getClipSourceSpan(clip));

  return Array.from({ length: tileCount }, (_, index) => ({
    key: `${clip.id}-${index}`,
    width: baseWidth + (index < widthRemainder ? 1 : 0),
    sampleTime: sourceSpan > 0
      ? clip.trimIn + (sourceSpan * ((index + 0.5) / tileCount))
      : clip.trimIn,
  }));
}

export async function captureVideoThumbnailStrip(
  sourceUrl: string,
  tiles: VideoThumbnailTile[],
  targetHeight: number = Math.max(18, UI.THUMBNAIL_HEIGHT - 12)
): Promise<Array<string | null>> {
  if (typeof document === "undefined" || tiles.length === 0) {
    return tiles.map(() => null);
  }

  const results: Array<string | null> = Array.from({ length: tiles.length }, () => null);
  const uncachedTiles: Array<{ tile: VideoThumbnailTile; index: number; cacheKey: string }> = [];

  tiles.forEach((tile, index) => {
    const cacheKey = buildThumbnailCacheKey(sourceUrl, tile.sampleTime, targetHeight);
    if (thumbnailCache.has(cacheKey)) {
      touchThumbnailCacheKey(cacheKey);
      results[index] = thumbnailCache.get(cacheKey) ?? null;
      return;
    }
    uncachedTiles.push({ tile, index, cacheKey });
  });

  if (uncachedTiles.length === 0) {
    return results;
  }

  const video = getThumbnailVideo(sourceUrl);

  try {
    await ensureVideoMetadata(video);

    const safeDuration = Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0;
    const intrinsicWidth = Math.max(1, video.videoWidth || Math.round(targetHeight * (16 / 9)));
    const intrinsicHeight = Math.max(1, video.videoHeight || targetHeight);
    const renderWidth = Math.max(1, Math.round(targetHeight * (intrinsicWidth / intrinsicHeight)));
    const canvas = getThumbnailCanvas(sourceUrl, renderWidth, targetHeight);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to create video thumbnail canvas");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    for (let uncachedIndex = 0; uncachedIndex < uncachedTiles.length; uncachedIndex += 1) {
      const { tile, index, cacheKey } = uncachedTiles[uncachedIndex];
      const safeSampleTime = safeDuration > VIDEO_FRAME_EPSILON
        ? clamp(tile.sampleTime, 0, Math.max(0, safeDuration - VIDEO_FRAME_EPSILON))
        : 0;
      await seekVideo(video, safeSampleTime);
      await ensureVideoFrame(video);
      context.clearRect(0, 0, renderWidth, targetHeight);
      context.drawImage(video, 0, 0, renderWidth, targetHeight);
      const dataUrl = await encodeThumbnailCanvas(canvas);
      setThumbnailCacheValue(cacheKey, dataUrl);
      results[index] = dataUrl;

      if ((uncachedIndex + 1) % THUMBNAIL_BATCH_SIZE === 0) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      }
    }
  } catch (error) {
    console.warn("Failed to build video clip thumbnails:", error);
    uncachedTiles.forEach(({ cacheKey, index }) => {
      setThumbnailCacheValue(cacheKey, null);
      results[index] = null;
    });
  }

  return results;
}
