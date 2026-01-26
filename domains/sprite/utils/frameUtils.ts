// ============================================
// Sprite Frame Utilities
// ============================================

import { SpriteFrame } from "../types";

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
