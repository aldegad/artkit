// ============================================
// Sprite Frame Utilities
// ============================================

import { SpriteFrame } from "../types";

export type FrameFlipDirection = "horizontal" | "vertical";

/**
 * Create a deep copy of frames array
 * Used for history management and clipboard operations
 */
export function deepCopyFrames(frames: SpriteFrame[]): SpriteFrame[] {
  return frames.map((f) => ({
    ...f,
    points: [...f.points],
    offset: { ...f.offset },
  }));
}

/**
 * Create a deep copy of a single frame
 */
export function deepCopyFrame(frame: SpriteFrame): SpriteFrame {
  return {
    ...frame,
    points: frame.points.map((p) => ({ ...p })),
    offset: { ...frame.offset },
  };
}

/**
 * Generate a unique layer ID
 */
export function generateLayerId(): string {
  return `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load frame image."));
    image.src = dataUrl;
  });
}

export async function flipFrameImageData(
  imageData: string,
  direction: FrameFlipDirection,
): Promise<string> {
  const image = await loadImageFromDataUrl(imageData);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return imageData;

  ctx.save();
  if (direction === "horizontal") {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(image, 0, 0);
  ctx.restore();

  return canvas.toDataURL("image/png");
}
