import { useEffect, useRef, useCallback, useMemo } from "react";
import { VideoTrack, Clip, MaskData, getSourceTime } from "../types";
import { Size } from "@/shared/types";
import { PRE_RENDER } from "../constants";
import { renderCompositeFrame } from "../utils/compositeRenderer";
import {
  buildPlaybackTrackClipIndex,
  resolvePlaybackMediaSnapshot,
} from "../utils/playbackActiveMedia";

// --- Module-level cache (shared across renders) ---

const frameCache = new Map<number, ImageBitmap>();
const cachedFrameSet = new Set<number>();
let cacheVersion = 0;
let totalFrameCount = 0;

// Monotonically increasing counter — each pre-render loop gets a unique generation.
// When a new loop starts, old loops detect the mismatch and exit.
let renderGeneration = 0;
const RGBA_BYTES_PER_PIXEL = 4;
const PRE_RENDER_MIN_CACHE_RESOLUTION_SCALE = 0.5;
const PRE_RENDER_TARGET_LONG_EDGE_PX = 1280;
const PRE_RENDER_HIGH_MEMORY_MAX_BYTES_BUDGET = 192 * 1024 * 1024;
const PRE_RENDER_LOW_MEMORY_MAX_BYTES_BUDGET = 96 * 1024 * 1024;
const PRE_RENDER_MOBILE_MAX_BYTES_BUDGET = 48 * 1024 * 1024;
const PRE_RENDER_HIDDEN_TAB_MAX_BYTES_BUDGET = 24 * 1024 * 1024;
const PRE_RENDER_MIN_FRAMES = 24;
const PRE_RENDER_CONSTRAINED_MIN_FRAMES = 8;
const PRE_RENDER_PARTIAL_INVALIDATION_MAX_RANGES = 16;

// Simple event emitter for cache status updates
type CacheStatusListener = () => void;
const cacheListeners = new Set<CacheStatusListener>();

function emitCacheStatus() {
  for (const listener of cacheListeners) {
    listener();
  }
}

export function subscribeCacheStatus(listener: CacheStatusListener): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

export function getCacheStatus(): {
  cachedSet: ReadonlySet<number>;
  totalFrames: number;
  version: number;
} {
  return {
    cachedSet: cachedFrameSet,
    totalFrames: totalFrameCount,
    version: cacheVersion,
  };
}

function clearCache() {
  for (const bitmap of frameCache.values()) {
    bitmap.close();
  }
  frameCache.clear();
  cachedFrameSet.clear();
  totalFrameCount = 0;
  cacheVersion++;
  emitCacheStatus();
}

function deleteCachedFrame(frameIndex: number): boolean {
  const bitmap = frameCache.get(frameIndex);
  if (!bitmap) return false;
  bitmap.close();
  frameCache.delete(frameIndex);
  cachedFrameSet.delete(frameIndex);
  cacheVersion++;
  return true;
}

function evictFarthestCachedFrame(targetFrameIndex: number): boolean {
  let farthestFrameIndex: number | null = null;
  let farthestDistance = -1;

  for (const frameIndex of frameCache.keys()) {
    const distance = Math.abs(frameIndex - targetFrameIndex);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestFrameIndex = frameIndex;
    }
  }

  if (farthestFrameIndex === null) return false;
  return deleteCachedFrame(farthestFrameIndex);
}

function resolveRuntimePreRenderBudget(): {
  maxBytesBudget: number;
  constrained: boolean;
} {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      maxBytesBudget: PRE_RENDER_HIGH_MEMORY_MAX_BYTES_BUDGET,
      constrained: false,
    };
  }

  const ua = navigator.userAgent || "";
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = window.innerWidth > 0 && window.innerWidth <= 1024;
  const isMobileLike = mobileUA || (coarsePointer && narrowViewport);
  const deviceMemory = typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === "number"
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null
    : null;
  const isHiddenTab = document.visibilityState === "hidden";

  let maxBytesBudget = PRE_RENDER_HIGH_MEMORY_MAX_BYTES_BUDGET;
  if (typeof deviceMemory === "number" && deviceMemory <= 4) {
    maxBytesBudget = PRE_RENDER_LOW_MEMORY_MAX_BYTES_BUDGET;
  }
  if (isMobileLike) {
    maxBytesBudget = Math.min(maxBytesBudget, PRE_RENDER_MOBILE_MAX_BYTES_BUDGET);
  }
  if (isHiddenTab) {
    maxBytesBudget = Math.min(maxBytesBudget, PRE_RENDER_HIDDEN_TAB_MAX_BYTES_BUDGET);
  }

  return {
    maxBytesBudget,
    constrained: isMobileLike || isHiddenTab || (typeof deviceMemory === "number" && deviceMemory <= 4),
  };
}

function timeToFrameIndex(time: number): number {
  if (!Number.isFinite(time)) return 0;
  // Use floor-based indexing so cached sampling never jumps to a future frame.
  // This avoids visible rollbacks at cache/non-cache boundaries during playback.
  return Math.max(0, Math.floor(time * PRE_RENDER.FRAME_RATE + 1e-6));
}

function frameIndexToTime(frameIndex: number): number {
  return frameIndex / PRE_RENDER.FRAME_RATE;
}

function mergeTimeRanges(ranges: Array<{ startTime: number; endTime: number }>): Array<{ startTime: number; endTime: number }> {
  const normalized = ranges
    .map((range) => ({
      startTime: Math.max(0, Math.min(range.startTime, range.endTime)),
      endTime: Math.max(range.startTime, range.endTime),
    }))
    .filter((range) => Number.isFinite(range.startTime) && Number.isFinite(range.endTime) && range.endTime >= range.startTime)
    .sort((left, right) => left.startTime - right.startTime);

  if (normalized.length <= 1) {
    return normalized;
  }

  const merged: Array<{ startTime: number; endTime: number }> = [normalized[0]];
  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index];
    const previous = merged[merged.length - 1];
    if (current.startTime <= previous.endTime + (1 / PRE_RENDER.FRAME_RATE)) {
      previous.endTime = Math.max(previous.endTime, current.endTime);
      continue;
    }
    merged.push(current);
  }

  return merged;
}

function invalidateCachedTimeRanges(ranges: Array<{ startTime: number; endTime: number }>): boolean {
  const mergedRanges = mergeTimeRanges(ranges);
  if (mergedRanges.length === 0) {
    return false;
  }

  let deletedAny = false;
  for (const frameIndex of [...frameCache.keys()]) {
    const frameTime = frameIndexToTime(frameIndex);
    const shouldDelete = mergedRanges.some((range) => (
      frameTime >= range.startTime - (1 / PRE_RENDER.FRAME_RATE)
      && frameTime <= range.endTime + (1 / PRE_RENDER.FRAME_RATE)
    ));
    if (shouldDelete) {
      deletedAny = deleteCachedFrame(frameIndex) || deletedAny;
    }
  }

  if (deletedAny) {
    emitCacheStatus();
  }
  return deletedAny;
}

function resolvePreRenderBudget(projectSize: Size): {
  cacheW: number;
  cacheH: number;
  cacheResolutionScale: number;
  frameLimit: number;
  constrainedRuntime: boolean;
} {
  const runtimeBudget = resolveRuntimePreRenderBudget();
  const baseScale = PRE_RENDER.CACHE_RESOLUTION_SCALE;
  const maxDimension = Math.max(projectSize.width, projectSize.height, 1);
  const adaptiveScale = Math.min(1, PRE_RENDER_TARGET_LONG_EDGE_PX / maxDimension);
  const cacheResolutionScale = Math.max(
    PRE_RENDER_MIN_CACHE_RESOLUTION_SCALE,
    Math.min(baseScale, adaptiveScale)
  );

  const cacheW = Math.max(1, Math.round(projectSize.width * cacheResolutionScale));
  const cacheH = Math.max(1, Math.round(projectSize.height * cacheResolutionScale));
  const bytesPerFrame = Math.max(1, cacheW * cacheH * RGBA_BYTES_PER_PIXEL);
  const minFrames = runtimeBudget.constrained ? PRE_RENDER_CONSTRAINED_MIN_FRAMES : PRE_RENDER_MIN_FRAMES;
  const budgetFrameLimit = Math.max(
    minFrames,
    Math.floor(runtimeBudget.maxBytesBudget / bytesPerFrame)
  );
  const frameLimit = Math.max(
    minFrames,
    Math.min(PRE_RENDER.MAX_FRAMES, budgetFrameLimit)
  );

  return {
    cacheW,
    cacheH,
    cacheResolutionScale,
    frameLimit,
    constrainedRuntime: runtimeBudget.constrained,
  };
}

function hashTokenParts(parts: Array<string | number | boolean | null | undefined>): number {
  let hash = 2166136261;
  for (const part of parts) {
    const token = String(part ?? "");
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 124;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildClipCacheSignature(clip: Clip): number {
  return hashTokenParts([
    clip.id,
    clip.trackId,
    clip.type,
    clip.startTime,
    clip.duration,
    clip.trimIn,
    clip.trimOut,
    clip.playbackSpeed,
    clip.sourceUrl,
    clip.position.x,
    clip.position.y,
    clip.scale,
    clip.scaleX ?? 1,
    clip.scaleY ?? 1,
    clip.opacity,
    clip.visible,
  ]);
}

function buildMaskCacheSignature(mask: MaskData): number {
  return hashTokenParts([
    mask.id,
    mask.trackId,
    mask.startTime,
    mask.duration,
    mask.maskData?.length ?? 0,
  ]);
}

// Wait for a video element to finish seeking
function waitForSeek(video: HTMLVideoElement, targetTime: number): Promise<boolean> {
  if (Math.abs(video.currentTime - targetTime) < 0.02) {
    return Promise.resolve(true);
  }
  if (video.readyState < 1) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, PRE_RENDER.SEEK_TIMEOUT_MS);

    const onSeeked = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        video.removeEventListener("seeked", onSeeked);
        resolve(true);
      }
    };

    video.addEventListener("seeked", onSeeked);
    video.currentTime = targetTime;
  });
}

// --- Hook ---

interface UsePreRenderCacheParams {
  tracks: VideoTrack[];
  clips: Clip[];
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  getMaskAtTimeForTrack: (trackId: string, time: number) => string | null;
  masks: Map<string, MaskData>;
  videoElements: Map<string, HTMLVideoElement>;
  imageCache: Map<string, HTMLImageElement>;
  maskImageCache: Map<string, HTMLImageElement>;
  projectSize: Size;
  projectDuration: number;
  isPlaying: boolean;
  suspendPreRender?: boolean;
  currentTime: number;
  currentTimeRef: React.RefObject<number>;
  enabled?: boolean;
  debugLogs?: boolean;
}

export function usePreRenderCache(params: UsePreRenderCacheParams) {
  const {
    tracks,
    clips,
    getClipAtTime,
    getMaskAtTimeForTrack,
    masks,
    videoElements,
    imageCache,
    maskImageCache,
    projectSize,
    projectDuration,
    isPlaying,
    suspendPreRender = false,
    currentTime,
    currentTimeRef,
    enabled = true,
    debugLogs = false,
  } = params;

  // Stable fingerprints — only change when actual content changes, not on reference changes.
  // This prevents cache invalidation on unrelated React re-renders (e.g. seek).
  const trackFingerprint = useMemo(() => (
    hashTokenParts(tracks.flatMap((track) => [track.id, track.visible, track.zIndex, track.muted]))
  ), [tracks]);

  const clipFingerprint = useMemo(() => (
    hashTokenParts(clips.flatMap((clip) => [
      clip.id,
      clip.trackId,
      clip.type,
      clip.startTime,
      clip.duration,
      clip.trimIn,
      clip.trimOut,
      clip.playbackSpeed,
      clip.sourceUrl,
      clip.position.x,
      clip.position.y,
      clip.scale,
      clip.scaleX ?? 1,
      clip.scaleY ?? 1,
      clip.opacity,
      clip.visible,
    ]))
  ), [clips]);

  const maskFingerprint = useMemo(() => (
    hashTokenParts([...masks.values()].flatMap((mask) => [
      mask.id,
      mask.trackId,
      mask.startTime,
      mask.duration,
      mask.maskData?.length ?? 0,
    ]))
  ), [masks]);
  const clipsByTrack = useMemo(() => buildPlaybackTrackClipIndex(clips), [clips]);

  const isPreRenderingRef = useRef(false);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskTempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipsByTrackRef = useRef(clipsByTrack);
  const lastSeekRestartFrameRef = useRef<number | null>(null);
  const previousClipSnapshotRef = useRef(new Map<string, { signature: number; startTime: number; endTime: number }>());
  const previousMaskSnapshotRef = useRef(new Map<string, { signature: number; startTime: number; endTime: number }>());
  const previousTrackFingerprintRef = useRef<number | null>(null);
  const previousProjectSignatureRef = useRef<string | null>(null);

  // Snapshot refs for stable access during async pre-render loop
  const tracksRef = useRef(tracks);
  const getClipAtTimeRef = useRef(getClipAtTime);
  const getMaskAtTimeForTrackRef = useRef(getMaskAtTimeForTrack);
  const videoElementsRef = useRef(videoElements);
  const imageCacheRef = useRef(imageCache);
  const maskImageCacheRef = useRef(maskImageCache);
  const projectSizeRef = useRef(projectSize);
  const projectDurationRef = useRef(projectDuration);

  // Keep refs in sync
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { getClipAtTimeRef.current = getClipAtTime; }, [getClipAtTime]);
  useEffect(() => { getMaskAtTimeForTrackRef.current = getMaskAtTimeForTrack; }, [getMaskAtTimeForTrack]);
  useEffect(() => { videoElementsRef.current = videoElements; }, [videoElements]);
  useEffect(() => { imageCacheRef.current = imageCache; }, [imageCache]);
  useEffect(() => { maskImageCacheRef.current = maskImageCache; }, [maskImageCache]);
  useEffect(() => { projectSizeRef.current = projectSize; }, [projectSize]);
  useEffect(() => { projectDurationRef.current = projectDuration; }, [projectDuration]);
  useEffect(() => { clipsByTrackRef.current = clipsByTrack; }, [clipsByTrack]);

  // Invalidate cache when structure or mask data changes.
  // Use fingerprints (not raw references) to avoid false invalidation on React re-renders.
  useEffect(() => {
    const projectSignature = `${projectSize.width}x${projectSize.height}:${projectDuration}`;
    const currentClipSnapshot = new Map<string, { signature: number; startTime: number; endTime: number }>();
    const currentMaskSnapshot = new Map<string, { signature: number; startTime: number; endTime: number }>();

    for (const clip of clips) {
      currentClipSnapshot.set(clip.id, {
        signature: buildClipCacheSignature(clip),
        startTime: clip.startTime,
        endTime: clip.startTime + clip.duration,
      });
    }

    for (const mask of masks.values()) {
      currentMaskSnapshot.set(mask.id, {
        signature: buildMaskCacheSignature(mask),
        startTime: mask.startTime,
        endTime: mask.startTime + mask.duration,
      });
    }

    if (debugLogs) {
      const visibleTrackCount = tracks.filter((track) => track.visible).length;
      const visibleClipCount = clips.filter((clip) => clip.visible).length;
      const visualClipCount = clips.filter((clip) => clip.type !== "audio").length;
      const videoClipCount = clips.filter((clip) => clip.type === "video").length;
      const audioClipCount = clips.filter((clip) => clip.type === "audio").length;

      console.info("[VideoPreRenderInvalidate]", {
        trackCount: tracks.length,
        visibleTrackCount,
        clipCount: clips.length,
        visibleClipCount,
        visualClipCount,
        videoClipCount,
        audioClipCount,
        maskCount: masks.size,
        clipFingerprint,
      });
    }

    const shouldClearEntireCache =
      previousTrackFingerprintRef.current === null
      || previousProjectSignatureRef.current === null
      || previousTrackFingerprintRef.current !== trackFingerprint
      || previousProjectSignatureRef.current !== projectSignature;

    if (shouldClearEntireCache) {
      clearCache();
    } else {
      const changedRanges: Array<{ startTime: number; endTime: number }> = [];
      const previousClipSnapshot = previousClipSnapshotRef.current;
      const previousMaskSnapshot = previousMaskSnapshotRef.current;

      for (const [clipId, snapshot] of currentClipSnapshot) {
        const previous = previousClipSnapshot.get(clipId);
        if (!previous || previous.signature !== snapshot.signature) {
          changedRanges.push({
            startTime: Math.min(previous?.startTime ?? snapshot.startTime, snapshot.startTime),
            endTime: Math.max(previous?.endTime ?? snapshot.endTime, snapshot.endTime),
          });
        }
      }

      for (const [clipId, previous] of previousClipSnapshot) {
        if (!currentClipSnapshot.has(clipId)) {
          changedRanges.push({
            startTime: previous.startTime,
            endTime: previous.endTime,
          });
        }
      }

      for (const [maskId, snapshot] of currentMaskSnapshot) {
        const previous = previousMaskSnapshot.get(maskId);
        if (!previous || previous.signature !== snapshot.signature) {
          changedRanges.push({
            startTime: Math.min(previous?.startTime ?? snapshot.startTime, snapshot.startTime),
            endTime: Math.max(previous?.endTime ?? snapshot.endTime, snapshot.endTime),
          });
        }
      }

      for (const [maskId, previous] of previousMaskSnapshot) {
        if (!currentMaskSnapshot.has(maskId)) {
          changedRanges.push({
            startTime: previous.startTime,
            endTime: previous.endTime,
          });
        }
      }

      const mergedRanges = mergeTimeRanges(changedRanges);
      const affectedDuration = mergedRanges.reduce(
        (sum, range) => sum + Math.max(0, range.endTime - range.startTime),
        0,
      );
      const clearDueToCoverage = mergedRanges.length > PRE_RENDER_PARTIAL_INVALIDATION_MAX_RANGES
        || (projectDuration > 0 && affectedDuration >= projectDuration * 0.75);

      if (clearDueToCoverage) {
        clearCache();
      } else if (mergedRanges.length > 0) {
        invalidateCachedTimeRanges(mergedRanges);
      }
    }

    previousTrackFingerprintRef.current = trackFingerprint;
    previousProjectSignatureRef.current = projectSignature;
    previousClipSnapshotRef.current = currentClipSnapshot;
    previousMaskSnapshotRef.current = currentMaskSnapshot;
  }, [
    clipFingerprint,
    clips,
    debugLogs,
    maskFingerprint,
    masks,
    projectDuration,
    projectSize,
    trackFingerprint,
    tracks,
  ]);

  // Pre-render loop
  const startPreRender = useCallback(async () => {
    if (!enabled) return;

    // If already running, don't interfere — let the existing loop continue
    if (isPreRenderingRef.current) return;

    // Bump generation — any older (zombie) loop will see the mismatch and exit
    renderGeneration++;
    const myGeneration = renderGeneration;
    isPreRenderingRef.current = true;

    // Init offscreen canvases
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement("canvas");
    }
    if (!maskTempCanvasRef.current) {
      maskTempCanvasRef.current = document.createElement("canvas");
    }

    const osc = offscreenCanvasRef.current;
    const pSize = projectSizeRef.current;
    const {
      cacheW,
      cacheH,
      cacheResolutionScale,
      frameLimit,
      constrainedRuntime,
    } = resolvePreRenderBudget(pSize);
    const queueFrameLimit = constrainedRuntime ? Math.min(frameLimit, 12) : frameLimit;
    osc.width = cacheW;
    osc.height = cacheH;

    const oscCtx = osc.getContext("2d");
    if (!oscCtx) {
      isPreRenderingRef.current = false;
      return;
    }

    const duration = projectDurationRef.current;
    totalFrameCount = Math.ceil(duration * PRE_RENDER.FRAME_RATE);

    // Build render queue: prioritize frames near playhead, then expand outward
    const playheadFrame = timeToFrameIndex(currentTimeRef.current);
    const queue: number[] = [];

    // Spread outward from playhead
    for (let offset = 0; offset < totalFrameCount; offset++) {
      const forward = playheadFrame + offset;
      const backward = playheadFrame - offset;

      if (forward < totalFrameCount && !cachedFrameSet.has(forward)) {
        queue.push(forward);
      }
      if (offset > 0 && backward >= 0 && !cachedFrameSet.has(backward)) {
        queue.push(backward);
      }

      if (queue.length >= queueFrameLimit) break;
    }

    if (debugLogs) {
      const currentTracks = tracksRef.current;
      const visibleTrackCount = currentTracks.filter((track) => track.visible).length;
      const visibleClipCount = clips.filter((clip) => clip.visible).length;
      console.info("[VideoPreRenderStart]", {
        totalFrames: totalFrameCount,
        queuedFrames: queue.length,
        frameLimit,
        queueFrameLimit,
        constrainedRuntime,
        cacheResolutionScale,
        cacheSize: { width: cacheW, height: cacheH },
        playheadFrame,
        trackCount: currentTracks.length,
        visibleTrackCount,
        clipCount: clips.length,
        visibleClipCount,
      });
    }

    for (const frameIdx of queue) {
      // Check if this loop instance is still the active one
      if (myGeneration !== renderGeneration) break;
      if (cachedFrameSet.has(frameIdx)) continue;

      if (
        frameCache.size >= frameLimit
        && !evictFarthestCachedFrame(playheadFrame)
      ) {
        break;
      }

      const time = frameIndexToTime(frameIdx);
      const currentTracks = tracksRef.current.filter((track) => track.visible);
      const playbackSnapshot = resolvePlaybackMediaSnapshot({
        tracks: currentTracks,
        clipsByTrack: clipsByTrackRef.current,
        time,
      });

      // Seek all video elements that are active at this time
      const seekPromises: Promise<boolean>[] = [];
      for (const clip of playbackSnapshot.activeVideoClips) {
        const videoEl = videoElementsRef.current.get(clip.id);
        if (!videoEl || videoEl.readyState < 1) continue;

        const sourceTime = getSourceTime(clip, time);
        seekPromises.push(waitForSeek(videoEl, sourceTime));
      }

      if (seekPromises.length > 0) {
        const results = await Promise.all(seekPromises);
        if (results.some((r) => !r)) {
          await new Promise((r) => setTimeout(r, PRE_RENDER.BATCH_DELAY_MS));
          continue;
        }
      }

      // Check again after async wait
      if (myGeneration !== renderGeneration) break;

      // Render composite frame to offscreen canvas (with retry for transient failures)
      let fullyRendered = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (myGeneration !== renderGeneration) break;

        oscCtx.clearRect(0, 0, cacheW, cacheH);
        fullyRendered = renderCompositeFrame(oscCtx, {
          time,
          tracks: currentTracks,
          getClipAtTime: getClipAtTimeRef.current,
          getMaskAtTimeForTrack: getMaskAtTimeForTrackRef.current,
          videoElements: videoElementsRef.current,
          imageCache: imageCacheRef.current,
          maskImageCache: maskImageCacheRef.current,
          maskTempCanvas: maskTempCanvasRef.current!,
          projectSize: projectSizeRef.current,
          renderRect: { x: 0, y: 0, width: cacheW, height: cacheH },
          // No live mask canvas for pre-rendering (use saved data only)
          isPlaying: false,
          // Skip redundant video seek check — waitForSeek already verified positioning
          preSeekVerified: true,
        });

        if (fullyRendered) break;
        // Wait briefly for video readyState / image loading to settle before retry
        await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
      }

      // Skip caching partial/incomplete frames after all retries exhausted.
      if (!fullyRendered) {
        await new Promise((r) => setTimeout(r, PRE_RENDER.BATCH_DELAY_MS));
        continue;
      }

      // Create ImageBitmap from rendered frame
      try {
        const bitmap = await createImageBitmap(osc);
        // Final check before storing
        if (myGeneration !== renderGeneration) {
          bitmap.close();
          break;
        }
        frameCache.set(frameIdx, bitmap);
        cachedFrameSet.add(frameIdx);
        emitCacheStatus();
      } catch {
        // createImageBitmap can fail if canvas is empty or invalid
      }

      // Yield to UI
      await new Promise((r) => setTimeout(r, PRE_RENDER.BATCH_DELAY_MS));
    }

    // Only reset flag if we're still the active generation
    if (myGeneration === renderGeneration) {
      isPreRenderingRef.current = false;
    }
  }, [clips, currentTimeRef, debugLogs, enabled]);

  const stopPreRender = useCallback(() => {
    // Bump generation so any running loop exits at the next check
    renderGeneration++;
    isPreRenderingRef.current = false;
  }, []);

  // Hard-disable mode (mobile draft mode / experiments)
  useEffect(() => {
    if (enabled) return;
    stopPreRender();
    clearCache();
  }, [enabled, stopPreRender]);

  // Start/stop pre-rendering based on playback state
  useEffect(() => {
    if (!enabled) return;

    if (isPlaying || suspendPreRender) {
      stopPreRender();
    } else {
      // Small delay before starting pre-render (let scrubbing settle)
      const timer = setTimeout(() => {
        if (!isPreRenderingRef.current) {
          startPreRender();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, suspendPreRender, startPreRender, stopPreRender, enabled]);

  // Restart pre-rendering when cache is invalidated
  useEffect(() => {
    if (!enabled) return;

    if (!isPlaying && !suspendPreRender) {
      stopPreRender();
      const timer = setTimeout(() => {
        startPreRender();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [trackFingerprint, clipFingerprint, maskFingerprint, projectSize, isPlaying, suspendPreRender, startPreRender, stopPreRender, enabled]);

  // Restart pre-render from new position when user seeks while paused.
  // This stops the pre-render loop from fighting over video elements
  // with the preview canvas, and re-prioritizes caching near the new playhead.
  useEffect(() => {
    if (!enabled) return;
    if (isPlaying || suspendPreRender) return;
    const currentFrame = timeToFrameIndex(currentTime);
    if (lastSeekRestartFrameRef.current !== null && lastSeekRestartFrameRef.current === currentFrame) {
      return;
    }
    lastSeekRestartFrameRef.current = currentFrame;
    // Stop current pre-render (releases video elements for preview canvas)
    stopPreRender();
    // Debounce: restart after scrubbing settles
    const timer = setTimeout(() => {
      startPreRender();
    }, 180);
    return () => clearTimeout(timer);
  }, [currentTime, isPlaying, suspendPreRender, stopPreRender, startPreRender, enabled]);

  // Get cached frame for a given time
  const getCachedFrame = useCallback((time: number): ImageBitmap | null => {
    if (!enabled) return null;
    const frameIdx = timeToFrameIndex(time);
    return frameCache.get(frameIdx) || null;
  }, [enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreRender();
    };
  }, [stopPreRender]);

  return { getCachedFrame, isPreRenderingRef };
}
