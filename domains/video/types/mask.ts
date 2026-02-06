import { Size } from "@/shared/types";

/**
 * Mask keyframe for interpolation
 */
export interface MaskKeyframe {
  id: string;
  time: number; // Keyframe time relative to mask start (seconds)
  maskData: string; // Base64 encoded mask
  easing: MaskEasing;
}

export type MaskEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/**
 * Track-level mask data with independent time range.
 * Lives on a track's mask lane and can span multiple clips.
 * White = visible, Black = transparent (reveals below).
 */
export interface MaskData {
  id: string;
  trackId: string; // Track this mask belongs to
  startTime: number; // Timeline start time (seconds)
  duration: number; // Mask duration (seconds)
  size: Size; // Mask canvas size (= project canvasSize)
  keyframes: MaskKeyframe[];
}

/**
 * Create empty mask for a track
 */
export function createMaskData(
  trackId: string,
  size: Size,
  startTime: number = 0,
  duration: number = 5
): MaskData {
  return {
    id: crypto.randomUUID(),
    trackId,
    size,
    startTime,
    duration,
    keyframes: [],
  };
}

/**
 * Mask brush tool settings
 */
export interface MaskBrushSettings {
  size: number; // Brush diameter (pixels)
  hardness: number; // Edge softness 0-100
  opacity: number; // Brush opacity 0-100
  mode: "paint" | "erase"; // Add or remove mask
  feather: number; // Edge feathering (pixels)
}

export const DEFAULT_MASK_BRUSH: MaskBrushSettings = {
  size: 50,
  hardness: 80,
  opacity: 100,
  mode: "paint",
  feather: 0,
};
