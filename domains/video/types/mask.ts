import { Size } from "@/shared/types";

/**
 * Track-level mask data with independent time range.
 * Lives on a track's mask lane and can span multiple clips.
 * White = visible, Black = transparent (reveals below).
 * Each mask stores a single painted area (base64 image).
 */
export interface MaskData {
  id: string;
  trackId: string; // Track this mask belongs to
  startTime: number; // Timeline start time (seconds)
  duration: number; // Mask duration (seconds)
  size: Size; // Mask canvas size (= project canvasSize)
  maskData: string | null; // Base64 encoded mask image (single area)
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
    maskData: null,
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
