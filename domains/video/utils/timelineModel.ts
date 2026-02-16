import { Size } from "@/shared/types";
import { TIMELINE } from "../constants";
import { Clip, INITIAL_TIMELINE_VIEW, TimelineViewState, VideoTrack } from "../types";
import { loadMediaBlob } from "./mediaStorage";
import { normalizeClipTransformKeyframes } from "./clipTransformKeyframes";

export function cloneTrack(track: VideoTrack): VideoTrack {
  return { ...track };
}

export function cloneClip(clip: Clip): Clip {
  const transformKeyframes = normalizeClipTransformKeyframes(clip);
  const base = {
    ...clip,
    position: { ...clip.position },
    transformKeyframes,
  };

  return {
    ...base,
    sourceSize: { ...clip.sourceSize },
  };
}

export function calculateClipsDuration(clips: Clip[]): number {
  return clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
}

export function getDuplicateTrackName(sourceName: string, existingTracks: VideoTrack[]): string {
  const base = `${sourceName} (Copy)`;
  if (!existingTracks.some((track) => track.name === base)) {
    return base;
  }

  let suffix = 2;
  let candidate = `${base} ${suffix}`;
  while (existingTracks.some((track) => track.name === candidate)) {
    suffix += 1;
    candidate = `${base} ${suffix}`;
  }
  return candidate;
}

export function getDefaultTrackName(existingTracks: VideoTrack[], type: "video" | "audio"): string {
  const countForType = existingTracks.filter((track) => track.type === type).length + 1;
  return type === "audio" ? `Audio ${countForType}` : `Video ${countForType}`;
}

export function reindexTracksForZOrder(tracks: VideoTrack[]): VideoTrack[] {
  // Top track (index 0) gets highest zIndex (foreground).
  return tracks.map((track, index) => ({ ...track, zIndex: tracks.length - 1 - index }));
}

export function normalizeClip(clip: Clip): Clip {
  const baseScale = typeof clip.scale === "number" ? clip.scale : 1;
  const scaleX = typeof clip.scaleX === "number" ? clip.scaleX : 1;
  const scaleY = typeof clip.scaleY === "number" ? clip.scaleY : 1;
  const transformKeyframes = normalizeClipTransformKeyframes(clip);

  if (clip.type === "video") {
    return {
      ...clip,
      scale: baseScale,
      scaleX,
      scaleY,
      transformKeyframes,
      hasAudio: clip.hasAudio ?? true,
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  if (clip.type === "audio") {
    return {
      ...clip,
      scale: baseScale,
      scaleX,
      scaleY,
      transformKeyframes,
      sourceSize: clip.sourceSize || { width: 0, height: 0 },
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  return {
    ...clip,
    scale: baseScale,
    scaleX,
    scaleY,
    transformKeyframes,
  };
}

export function fitsTrackType(track: VideoTrack | null, clip: Clip): boolean {
  if (!track) return false;
  if (track.type === "audio") return clip.type === "audio";
  return clip.type !== "audio";
}

export function resolveTrackIdForClipType(
  trackId: string,
  clipType: Clip["type"],
  tracks: VideoTrack[],
): string {
  const track = tracks.find((candidate) => candidate.id === trackId) || null;
  if (!track) return trackId;

  if (clipType === "audio") {
    if (track.type === "audio") return trackId;
    return tracks.find((candidate) => candidate.type === "audio")?.id || trackId;
  }

  if (track.type !== "audio") return trackId;
  return tracks.find((candidate) => candidate.type !== "audio")?.id || trackId;
}

export function getFittedVisualTransform(sourceSize: Size, canvasSize: Size): { position: { x: number; y: number }; scale: number } {
  if (
    sourceSize.width <= 0 ||
    sourceSize.height <= 0 ||
    canvasSize.width <= 0 ||
    canvasSize.height <= 0
  ) {
    return {
      position: { x: 0, y: 0 },
      scale: 1,
    };
  }

  const scale = Math.min(
    canvasSize.width / sourceSize.width,
    canvasSize.height / sourceSize.height
  );
  const fittedWidth = sourceSize.width * scale;
  const fittedHeight = sourceSize.height * scale;

  return {
    position: {
      x: (canvasSize.width - fittedWidth) / 2,
      y: (canvasSize.height - fittedHeight) / 2,
    },
    scale,
  };
}

const OVERLAP_TIME_EPSILON = 1e-6;
const FRAME_INDEX_EPSILON = 1e-6;

function normalizeOverlapFrameRate(frameRate: number): number | null {
  if (!Number.isFinite(frameRate) || frameRate <= 0) return null;
  return Math.max(1, Math.round(frameRate));
}

function toStartFrameIndex(time: number, frameRate: number): number {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  return Math.floor(safeTime * frameRate + FRAME_INDEX_EPSILON);
}

function toEndFrameIndex(time: number, frameRate: number): number {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  return Math.ceil(safeTime * frameRate - FRAME_INDEX_EPSILON);
}

function rangesOverlap(startA: number, durationA: number, startB: number, durationB: number): boolean {
  const endA = startA + durationA;
  const endB = startB + durationB;
  return startA < endB - OVERLAP_TIME_EPSILON && endA > startB + OVERLAP_TIME_EPSILON;
}

export function hasTrackOverlap(
  allClips: Clip[],
  candidate: { trackId: string; startTime: number; duration: number },
  excludeClipIds: Set<string> = new Set(),
  frameRate?: number
): boolean {
  const safeFrameRate = normalizeOverlapFrameRate(frameRate ?? Number.NaN);
  const candidateStartFrame = safeFrameRate
    ? toStartFrameIndex(candidate.startTime, safeFrameRate)
    : null;
  const candidateEndFrame = safeFrameRate
    ? Math.max(
      toStartFrameIndex(candidate.startTime, safeFrameRate),
      toEndFrameIndex(candidate.startTime + candidate.duration, safeFrameRate)
    )
    : null;

  for (const clip of allClips) {
    if (clip.trackId !== candidate.trackId) continue;
    if (excludeClipIds.has(clip.id)) continue;
    if (safeFrameRate && candidateStartFrame !== null && candidateEndFrame !== null) {
      const clipStartFrame = toStartFrameIndex(clip.startTime, safeFrameRate);
      const clipEndFrame = Math.max(
        clipStartFrame,
        toEndFrameIndex(clip.startTime + clip.duration, safeFrameRate)
      );
      if (candidateStartFrame < clipEndFrame && candidateEndFrame > clipStartFrame) {
        return true;
      }
      continue;
    }
    if (rangesOverlap(candidate.startTime, candidate.duration, clip.startTime, clip.duration)) {
      return true;
    }
  }
  return false;
}

function findNextNonOverlappingStart(
  allClips: Clip[],
  trackId: string,
  startTime: number,
  duration: number,
  excludeClipIds: Set<string> = new Set()
): number {
  let nextStart = Math.max(0, startTime);
  const trackClips = allClips
    .filter((clip) => clip.trackId === trackId && !excludeClipIds.has(clip.id))
    .sort((a, b) => a.startTime - b.startTime);

  let changed = true;
  while (changed) {
    changed = false;
    for (const clip of trackClips) {
      if (rangesOverlap(nextStart, duration, clip.startTime, clip.duration)) {
        nextStart = clip.startTime + clip.duration;
        changed = true;
      }
    }
  }

  return nextStart;
}

export function withSafeClipStart(
  allClips: Clip[],
  clip: Clip,
  startTime: number = clip.startTime,
  excludeClipIds: Set<string> = new Set()
): Clip {
  const safeStartTime = findNextNonOverlappingStart(
    allClips,
    clip.trackId,
    startTime,
    clip.duration,
    excludeClipIds
  );
  return {
    ...clip,
    startTime: safeStartTime,
  };
}

export function sanitizeTimelineViewState(viewState: TimelineViewState): TimelineViewState {
  const zoom = Number.isFinite(viewState.zoom) ? viewState.zoom : INITIAL_TIMELINE_VIEW.zoom;
  const scrollX = Number.isFinite(viewState.scrollX) ? viewState.scrollX : 0;
  const scrollY = Number.isFinite(viewState.scrollY) ? viewState.scrollY : 0;
  return {
    ...INITIAL_TIMELINE_VIEW,
    ...viewState,
    zoom: Math.max(TIMELINE.MIN_ZOOM, Math.min(TIMELINE.MAX_ZOOM, zoom)),
    scrollX: Math.max(0, scrollX),
    scrollY: Math.max(0, scrollY),
  };
}

function isTimeInsideClip(clip: Clip, time: number): boolean {
  return time >= clip.startTime && time < clip.startTime + clip.duration;
}

export function findClipAtTime(trackClips: Clip[], time: number): Clip | null {
  if (trackClips.length === 0) return null;

  // Find the right-most clip whose startTime <= time.
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

  if (candidate < 0) return null;

  const primary = trackClips[candidate];
  if (isTimeInsideClip(primary, time)) return primary;

  // Fallback for unexpected overlap/out-of-order legacy data.
  for (let i = candidate - 1; i >= 0; i -= 1) {
    const clip = trackClips[i];
    if (clip.startTime + clip.duration <= time) break;
    if (isTimeInsideClip(clip, time)) return clip;
  }

  return null;
}

export async function restoreAutosavedClips(savedClips: Clip[]): Promise<{ restoredClips: Clip[]; durationHint: number }> {
  const restoredClips: Clip[] = [];
  const normalizedClips = savedClips.map((clip) => normalizeClip(clip));
  let durationHint = calculateClipsDuration(normalizedClips);
  const clipIdsBySourceId = new Map<string, string[]>();

  for (const clip of normalizedClips) {
    if (!clip.sourceId) continue;
    const ids = clipIdsBySourceId.get(clip.sourceId) || [];
    ids.push(clip.id);
    clipIdsBySourceId.set(clip.sourceId, ids);
  }

  const sourceBlobCache = new Map<string, Blob>();

  for (const normalizedClip of normalizedClips) {
    let blob = await loadMediaBlob(normalizedClip.id);
    if (!blob && normalizedClip.sourceId) {
      blob = sourceBlobCache.get(normalizedClip.sourceId) || null;
      if (!blob) {
        const candidateIds = clipIdsBySourceId.get(normalizedClip.sourceId) || [];
        for (const candidateId of candidateIds) {
          if (candidateId === normalizedClip.id) continue;
          const candidateBlob = await loadMediaBlob(candidateId);
          if (candidateBlob) {
            blob = candidateBlob;
            sourceBlobCache.set(normalizedClip.sourceId, candidateBlob);
            break;
          }
        }
      }
    }

    if (blob) {
      if (normalizedClip.sourceId && !sourceBlobCache.has(normalizedClip.sourceId)) {
        sourceBlobCache.set(normalizedClip.sourceId, blob);
      }
      restoredClips.push({ ...normalizedClip, sourceUrl: URL.createObjectURL(blob) });
      continue;
    }

    // Non-blob URL (e.g., remote URL), keep as is.
    if (!normalizedClip.sourceUrl.startsWith("blob:")) {
      restoredClips.push(normalizedClip);
    }
    // If blob URL but no stored blob, skip (invalid).
  }

  if (restoredClips.length > 0) {
    durationHint = Math.max(durationHint, calculateClipsDuration(restoredClips));
  }

  return { restoredClips, durationHint };
}
