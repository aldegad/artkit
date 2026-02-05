// ============================================
// Image Editor Domain Types
// ============================================

import { Size } from "../../../shared/types";

// Brush preset types
export type {
  PressureSettings,
  BrushPresetType,
  BrushPreset,
  DrawingParameters,
} from "./brush";

// Re-export shared types for convenience
export type {
  Point,
  Size,
  BoundingBox,
  UnifiedLayer,
} from "../../../shared/types";

export {
  createLayerWithSize,
  createPaintLayer,
} from "../../../shared/types/layers";

// ============================================
// Editor-specific Types
// ============================================

export type EditorToolMode =
  | "crop"
  | "hand"
  | "zoom"
  | "brush"
  | "eraser"
  | "eyedropper"
  | "stamp"
  | "marquee"
  | "move"
  | "fill";

export type AspectRatio = "free" | "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export type OutputFormat = "webp" | "jpeg" | "png";

export type DragType = "create" | "move" | "resize" | "pan" | "draw" | null;

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * SavedImageProject: Saved project data for image editor
 */
export interface SavedImageProject {
  id: string;
  name: string;
  unifiedLayers: import("../../../shared/types").UnifiedLayer[];
  activeLayerId?: string;
  canvasSize: Size;
  rotation: number;
  savedAt: number;
  thumbnailUrl?: string; // For list view
}

// Aspect ratio configuration
export interface AspectRatioOption {
  value: AspectRatio;
  label: string;
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { value: "free", label: "Free" },
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
];

export const ASPECT_RATIO_VALUES: Record<AspectRatio, number | null> = {
  free: null,
  "1:1": 1,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
};
