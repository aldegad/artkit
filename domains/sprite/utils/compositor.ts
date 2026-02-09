import { SpriteTrack } from "../types";

// ============================================
// Multi-track Compositor
// ============================================

export interface CompositedFrame {
  dataUrl: string;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
}

/**
 * Load an image from a data URL
 */
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const imageTokenCache = new Map<string, number>();
let imageTokenCounter = 1;

const compositedFrameCache = new Map<string, Promise<CompositedFrame | null>>();
const MAX_COMPOSITED_CACHE = 240;

function getImageToken(src: string): number {
  const cached = imageTokenCache.get(src);
  if (cached) return cached;
  const token = imageTokenCounter++;
  imageTokenCache.set(src, token);
  return token;
}

function rememberCompositePromise(
  key: string,
  promise: Promise<CompositedFrame | null>,
): Promise<CompositedFrame | null> {
  compositedFrameCache.set(key, promise);
  while (compositedFrameCache.size > MAX_COMPOSITED_CACHE) {
    const oldest = compositedFrameCache.keys().next().value as string | undefined;
    if (!oldest) break;
    compositedFrameCache.delete(oldest);
  }
  promise.catch(() => {
    compositedFrameCache.delete(key);
  });
  return promise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      imageCache.delete(src);
      reject(new Error("Failed to load image"));
    };
    img.src = src;
  });

  imageCache.set(src, promise);
  return promise;
}

/**
 * Get the frame for a track at a given index, handling loop behavior
 */
function getTrackFrameIndex(
  track: SpriteTrack,
  frameIndex: number,
): number | null {
  if (track.frames.length === 0) return null;

  if (frameIndex < track.frames.length) {
    return frameIndex;
  }

  if (track.loop) {
    return frameIndex % track.frames.length;
  }

  return null; // track is shorter and doesn't loop
}

/**
 * Composite all visible tracks at a given frame index into a single image.
 * Tracks are rendered in timeline order: bottom row first, top row last.
 */
export async function compositeFrame(
  tracks: SpriteTrack[],
  frameIndex: number,
  outputSize?: { width: number; height: number },
  options?: { includeDataUrl?: boolean },
): Promise<CompositedFrame | null> {
  const includeDataUrl = options?.includeDataUrl ?? true;

  // Filter visible tracks and render by timeline order.
  // Track list is top -> bottom in UI, so reverse to draw bottom -> top.
  const visibleTracks = tracks
    .filter((t) => t.visible && t.frames.length > 0)
    .slice()
    .reverse();

  if (visibleTracks.length === 0) return null;

  // Collect frames to draw
  const framesToDraw: Array<{
    track: SpriteTrack;
    frameIdx: number;
  }> = [];

  for (const track of visibleTracks) {
    const idx = getTrackFrameIndex(track, frameIndex);
    if (idx !== null && track.frames[idx]?.imageData && !track.frames[idx]?.disabled) {
      framesToDraw.push({ track, frameIdx: idx });
    }
  }

  if (framesToDraw.length === 0) return null;

  const trackKey = framesToDraw
    .map(({ track, frameIdx }) => {
      const frame = track.frames[frameIdx];
      return [
        track.id,
        frameIdx,
        track.opacity,
        track.zIndex,
        frame.id,
        frame.offset?.x ?? 0,
        frame.offset?.y ?? 0,
        frame.imageData ? getImageToken(frame.imageData) : "n",
      ].join(":");
    })
    .join("|");

  const cacheKey = [
    frameIndex,
    includeDataUrl ? 1 : 0,
    outputSize?.width ?? "auto",
    outputSize?.height ?? "auto",
    trackKey,
  ].join("::");

  const cachedComposite = compositedFrameCache.get(cacheKey);
  if (cachedComposite) return cachedComposite;

  const composedPromise = (async (): Promise<CompositedFrame | null> => {
    // Load all images in parallel
    const loaded = await Promise.all(
      framesToDraw.map(async ({ track, frameIdx }) => {
        const frame = track.frames[frameIdx];
        const img = await loadImage(frame.imageData!);
        return { img, frame, opacity: track.opacity };
      }),
    );

    // Determine output dimensions
    let width = outputSize?.width ?? 0;
    let height = outputSize?.height ?? 0;

    if (!outputSize) {
      for (const { img, frame } of loaded) {
        const right = img.width + (frame.offset?.x ?? 0);
        const bottom = img.height + (frame.offset?.y ?? 0);
        if (right > width) width = right;
        if (bottom > height) height = bottom;
      }
    }

    if (width === 0 || height === 0) return null;

    // Create composite canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // Draw each layer bottom-to-top
    for (const { img, frame, opacity } of loaded) {
      ctx.globalAlpha = opacity / 100;
      const ox = frame.offset?.x ?? 0;
      const oy = frame.offset?.y ?? 0;
      ctx.drawImage(img, ox, oy);
    }

    ctx.globalAlpha = 1;

    return {
      dataUrl: includeDataUrl ? canvas.toDataURL("image/png") : "",
      width,
      height,
      canvas,
    };
  })();

  return rememberCompositePromise(cacheKey, composedPromise);
}

/**
 * Composite all frames for the entire animation duration.
 * Returns an array of composited frames (one per global frame index).
 */
export async function compositeAllFrames(
  tracks: SpriteTrack[],
  outputSize?: { width: number; height: number },
): Promise<CompositedFrame[]> {
  const maxFrames = Math.max(0, ...tracks.map((t) => t.frames.length));
  if (maxFrames === 0) return [];

  const results: CompositedFrame[] = [];

  for (let i = 0; i < maxFrames; i++) {
    // Skip frame if all visible tracks have disabled frames at this index
    const allDisabled = tracks
      .filter((t) => t.visible && t.frames.length > 0)
      .every((t) => {
        const idx = i < t.frames.length ? i : t.loop ? i % t.frames.length : -1;
        return idx === -1 || t.frames[idx]?.disabled;
      });
    if (allDisabled) continue;

    const composited = await compositeFrame(tracks, i, outputSize);
    if (composited) {
      results.push(composited);
    }
  }

  return results;
}
