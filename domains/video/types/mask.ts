import { Size } from "@/shared/types";

/**
 * Single frame mask data
 * Alpha channel: 255 = fully visible, 0 = fully transparent (reveals below)
 */
export interface MaskFrame {
  frameTime: number; // Time in seconds
  imageData: string; // Base64 encoded grayscale image (alpha channel)
  width: number;
  height: number;
}

/**
 * Mask keyframe for interpolation
 */
export interface MaskKeyframe {
  id: string;
  time: number; // Keyframe time (seconds)
  maskData: string; // Base64 encoded mask
  easing: MaskEasing;
}

export type MaskEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/**
 * Complete mask data for a clip
 */
export interface MaskData {
  id: string;
  clipId: string;
  size: Size; // Mask canvas size (matches video frame)

  // Mode determines how mask is stored
  mode: "per-frame" | "keyframed";

  // Per-frame mode: every frame has explicit mask
  frames?: MaskFrame[];

  // Keyframed mode: interpolate between keyframes
  keyframes?: MaskKeyframe[];

  // Current editing state (not persisted)
  isEditing?: boolean;
}

/**
 * Create empty mask for a clip
 */
export function createMaskData(
  clipId: string,
  size: Size,
  mode: "per-frame" | "keyframed" = "keyframed"
): MaskData {
  return {
    id: crypto.randomUUID(),
    clipId,
    size,
    mode,
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
