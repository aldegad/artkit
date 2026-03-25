import type { Clip, MaskData } from "../types";
import { findActiveClipAtTime, findActiveMaskAtTime } from "./videoExportHelpers";
import { loadExportVideoElement, resolveClipSourceBlob } from "./videoExportIO";

export interface TimedTrackMask {
  startTime: number;
  endTime: number;
  maskData: string;
}

export function buildClipIndex(clips: Clip[]): Map<string, Clip[]> {
  const clipsByTrack = new Map<string, Clip[]>();
  for (const clip of clips) {
    const list = clipsByTrack.get(clip.trackId);
    if (list) {
      list.push(clip);
    } else {
      clipsByTrack.set(clip.trackId, [clip]);
    }
  }

  for (const trackClips of clipsByTrack.values()) {
    trackClips.sort((a, b) => a.startTime - b.startTime);
  }

  return clipsByTrack;
}

export function findExportClipAtTime(
  trackClips: Clip[],
  time: number,
  tolerance: number,
): Clip | null {
  const exactClip = findActiveClipAtTime(trackClips, time);
  if (exactClip) return exactClip;
  if (trackClips.length === 0) return null;

  let lo = 0;
  let hi = trackClips.length - 1;
  let candidate = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (trackClips[mid].startTime <= time) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const nextClip = trackClips[candidate + 1] ?? null;
  if (
    nextClip &&
    Math.abs(nextClip.startTime - time) <= tolerance &&
    time < nextClip.startTime + nextClip.duration + tolerance
  ) {
    return nextClip;
  }

  const prevClip = candidate >= 0 ? trackClips[candidate] : null;
  if (
    prevClip &&
    Math.abs(time - (prevClip.startTime + prevClip.duration)) <= tolerance &&
    time >= prevClip.startTime - tolerance
  ) {
    return prevClip;
  }

  return null;
}

export function buildMaskIndex(masksMap: Map<string, MaskData>): Map<string, TimedTrackMask[]> {
  const masksByTrack = new Map<string, TimedTrackMask[]>();
  for (const mask of masksMap.values()) {
    if (!mask.maskData) continue;
    const timedMask = {
      startTime: mask.startTime,
      endTime: mask.startTime + mask.duration,
      maskData: mask.maskData,
    };
    const list = masksByTrack.get(mask.trackId);
    if (list) {
      list.push(timedMask);
    } else {
      masksByTrack.set(mask.trackId, [timedMask]);
    }
  }

  for (const trackMasks of masksByTrack.values()) {
    trackMasks.sort((a, b) => a.startTime - b.startTime);
  }

  return masksByTrack;
}

export async function preloadExportImages(params: {
  cleanupObjectUrls: string[];
  clips: Clip[];
  sourceBlobCache: Map<string, Blob>;
}): Promise<Map<string, HTMLImageElement>> {
  const { cleanupObjectUrls, clips, sourceBlobCache } = params;
  const imageCache = new Map<string, HTMLImageElement>();
  const imageClips = clips.filter((clip) => clip.type === "image");
  await Promise.all(
    imageClips.map(
      async (clip) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            imageCache.set(clip.sourceUrl, img);
            resolve();
          };
          img.onerror = () => resolve();
          resolveClipSourceBlob(clip, sourceBlobCache)
            .then((blob) => {
              const objectUrl = URL.createObjectURL(blob);
              cleanupObjectUrls.push(objectUrl);
              img.src = objectUrl;
            })
            .catch(() => {
              img.src = clip.sourceUrl;
            });
        })
    )
  );
  return imageCache;
}

export async function preloadMaskImages(
  masksMap: Map<string, MaskData>
): Promise<Map<string, HTMLImageElement>> {
  const maskCache = new Map<string, HTMLImageElement>();
  const maskDataUrls = new Set<string>();
  for (const mask of masksMap.values()) {
    if (mask.maskData) maskDataUrls.add(mask.maskData);
  }

  await Promise.all(
    [...maskDataUrls].map(
      (data) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            maskCache.set(data, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = data;
        })
    )
  );
  return maskCache;
}

export async function preloadExportVideos(params: {
  cleanupObjectUrls: string[];
  clips: Clip[];
  sourceBlobCache: Map<string, Blob>;
}): Promise<Map<string, HTMLVideoElement>> {
  const { cleanupObjectUrls, clips, sourceBlobCache } = params;
  const exportVideoCache = new Map<string, HTMLVideoElement>();
  const videoClips = clips.filter((clip) => clip.type === "video");
  await Promise.all(
    videoClips.map(async (clip) => {
      let video = await loadExportVideoElement(clip.sourceUrl);
      if (!video) {
        try {
          const sourceBlob = await resolveClipSourceBlob(clip, sourceBlobCache);
          const objectUrl = URL.createObjectURL(sourceBlob);
          cleanupObjectUrls.push(objectUrl);
          video = await loadExportVideoElement(objectUrl);
        } catch {
          video = null;
        }
      }
      if (video) {
        exportVideoCache.set(clip.id, video);
      }
    })
  );
  return exportVideoCache;
}

export { findActiveMaskAtTime };
