import { useEffect, useRef, useCallback, useMemo } from "react";
import { VideoTrack, Clip, MaskData } from "../types";
import { Size } from "@/shared/types";
import { PRE_RENDER } from "../constants";
import { renderCompositeFrame } from "../utils/compositeRenderer";

// --- Module-level cache (shared across renders) ---

const frameCache = new Map<number, ImageBitmap>();
const cachedFrameSet = new Set<number>();
let cacheVersion = 0;
let totalFrameCount = 0;

// Monotonically increasing counter — each pre-render loop gets a unique generation.
// When a new loop starts, old loops detect the mismatch and exit.
let renderGeneration = 0;

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
  cacheVersion++;
  emitCacheStatus();
}

function timeToFrameIndex(time: number): number {
  return Math.round(time * PRE_RENDER.FRAME_RATE);
}

function frameIndexToTime(frameIndex: number): number {
  return frameIndex / PRE_RENDER.FRAME_RATE;
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
  currentTime: number;
  currentTimeRef: React.RefObject<number>;
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
    currentTime,
    currentTimeRef,
  } = params;

  // Stable fingerprint for mask data — only changes when actual mask content changes
  const maskFingerprint = useMemo(() => {
    const parts: string[] = [];
    for (const [id, mask] of masks) {
      parts.push(`${id}:${mask.maskData?.length ?? 0}`);
    }
    return parts.join("|");
  }, [masks]);

  const isPreRenderingRef = useRef(false);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskTempCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Invalidate cache when structure or mask data changes
  useEffect(() => {
    clearCache();
  }, [tracks, clips, projectSize, maskFingerprint]);

  // Pre-render loop
  const startPreRender = useCallback(async () => {
    // Bump generation — any older loop will see the mismatch and exit
    renderGeneration++;
    const myGeneration = renderGeneration;

    if (isPreRenderingRef.current) return;
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
    const cacheW = Math.round(pSize.width * PRE_RENDER.CACHE_RESOLUTION_SCALE);
    const cacheH = Math.round(pSize.height * PRE_RENDER.CACHE_RESOLUTION_SCALE);
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
      const backward = playheadFrame - offset - 1;

      if (forward < totalFrameCount && !cachedFrameSet.has(forward)) {
        queue.push(forward);
      }
      if (offset > 0 && backward >= 0 && !cachedFrameSet.has(backward)) {
        queue.push(backward);
      }

      if (queue.length >= PRE_RENDER.MAX_FRAMES) break;
    }

    for (const frameIdx of queue) {
      // Check if this loop instance is still the active one
      if (myGeneration !== renderGeneration) break;
      if (frameCache.size >= PRE_RENDER.MAX_FRAMES) break;
      if (cachedFrameSet.has(frameIdx)) continue;

      const time = frameIndexToTime(frameIdx);
      const currentTracks = tracksRef.current;

      // Seek all video elements that are active at this time
      const seekPromises: Promise<boolean>[] = [];
      for (const track of currentTracks) {
        if (!track.visible) continue;
        const clip = getClipAtTimeRef.current(track.id, time);
        if (!clip || !clip.visible || clip.type !== "video") continue;

        const videoEl = videoElementsRef.current.get(clip.sourceUrl);
        if (!videoEl || videoEl.readyState < 1) continue;

        const sourceTime = clip.trimIn + (time - clip.startTime);
        seekPromises.push(waitForSeek(videoEl, sourceTime));
      }

      if (seekPromises.length > 0) {
        const results = await Promise.all(seekPromises);
        if (results.some((r) => !r)) {
          // Some seeks failed, skip this frame
          await new Promise((r) => setTimeout(r, PRE_RENDER.BATCH_DELAY_MS));
          continue;
        }
      }

      // Check again after async wait
      if (myGeneration !== renderGeneration) break;

      // Render composite frame to offscreen canvas
      oscCtx.clearRect(0, 0, cacheW, cacheH);

      renderCompositeFrame(oscCtx, {
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
      });

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
  }, [currentTimeRef]);

  const stopPreRender = useCallback(() => {
    // Bump generation so any running loop exits at the next check
    renderGeneration++;
    isPreRenderingRef.current = false;
  }, []);

  // Start/stop pre-rendering based on playback state
  useEffect(() => {
    if (isPlaying) {
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
  }, [isPlaying, startPreRender, stopPreRender]);

  // Restart pre-rendering when cache is invalidated
  useEffect(() => {
    if (!isPlaying) {
      stopPreRender();
      const timer = setTimeout(() => {
        startPreRender();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tracks, clips, maskFingerprint, projectSize, isPlaying, startPreRender, stopPreRender]);

  // Restart pre-render from new position when user seeks while paused.
  // This stops the pre-render loop from fighting over video elements
  // with the preview canvas, and re-prioritizes caching near the new playhead.
  useEffect(() => {
    if (isPlaying) return;
    // Stop current pre-render (releases video elements for preview canvas)
    stopPreRender();
    // Debounce: restart after scrubbing settles
    const timer = setTimeout(() => {
      startPreRender();
    }, 500);
    return () => clearTimeout(timer);
  }, [currentTime, isPlaying, stopPreRender, startPreRender]);

  // Get cached frame for a given time
  const getCachedFrame = useCallback((time: number): ImageBitmap | null => {
    const frameIdx = timeToFrameIndex(time);
    return frameCache.get(frameIdx) || null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreRender();
    };
  }, [stopPreRender]);

  return { getCachedFrame, isPreRenderingRef };
}
