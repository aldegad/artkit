import { SpriteTrack } from "../types";

// ============================================
// Multi-track Compositor
// ============================================

export interface CompositedFrame {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Load an image from a data URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
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
 * Tracks are rendered bottom-to-top by zIndex, with opacity applied.
 */
export async function compositeFrame(
  tracks: SpriteTrack[],
  frameIndex: number,
  outputSize?: { width: number; height: number },
): Promise<CompositedFrame | null> {
  // Filter visible tracks and sort by zIndex (low to high = bottom to top)
  const visibleTracks = tracks
    .filter((t) => t.visible && t.frames.length > 0)
    .sort((a, b) => a.zIndex - b.zIndex);

  if (visibleTracks.length === 0) return null;

  // Collect frames to draw
  const framesToDraw: Array<{
    track: SpriteTrack;
    frameIdx: number;
  }> = [];

  for (const track of visibleTracks) {
    const idx = getTrackFrameIndex(track, frameIndex);
    if (idx !== null && track.frames[idx]?.imageData) {
      framesToDraw.push({ track, frameIdx: idx });
    }
  }

  if (framesToDraw.length === 0) return null;

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
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
  };
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
    const composited = await compositeFrame(tracks, i, outputSize);
    if (composited) {
      results.push(composited);
    }
  }

  return results;
}
