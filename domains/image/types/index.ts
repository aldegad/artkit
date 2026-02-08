// ============================================
// Image Editor Domain Types
// ============================================

import { Size, UnifiedLayer } from "../../../shared/types";
import { Guide } from "./guides";

// Brush preset types
export type {
  PressureSettings,
  BrushPresetType,
  BrushPreset,
  DrawingParameters,
} from "./brush";

// Snap system types
export type {
  SnapSourceType,
  SnapOrientation,
  SnapSource,
  SnapResult,
  SnapConfig,
  SnapEdge,
} from "./snap";
export { DEFAULT_SNAP_CONFIG } from "./snap";

// Guide types
export type {
  GuideOrientation,
  Guide,
  GuideDragState,
} from "./guides";
export { INITIAL_GUIDE_DRAG_STATE } from "./guides";

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
  | "fill"
  | "transform";

// Re-export shared AspectRatio types
export type { AspectRatio, AspectRatioOption } from "../../../shared/types/aspectRatio";
export { ASPECT_RATIOS, ASPECT_RATIO_VALUES } from "../../../shared/types/aspectRatio";

export type OutputFormat = "webp" | "jpeg" | "png";

export type DragType = "create" | "move" | "resize" | "pan" | "draw" | "guide" | null;

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
  unifiedLayers: UnifiedLayer[];
  activeLayerId?: string;
  canvasSize: Size;
  rotation: number;
  savedAt: number;
  thumbnailUrl?: string; // For list view
  guides?: Guide[];
  // View state (optional for backward compatibility)
  zoom?: number;
  pan?: { x: number; y: number };
  // Brush settings (optional for backward compatibility)
  brushSize?: number;
  brushColor?: string;
  brushHardness?: number;
  // UI state (optional for backward compatibility)
  showRulers?: boolean;
  showGuides?: boolean;
  lockGuides?: boolean;
  snapToGuides?: boolean;
}

