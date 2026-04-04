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
  TextLayerData,
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
  | "text"
  | "brush"
  | "eraser"
  | "magicWand"
  | "eyedropper"
  | "stamp"
  | "marquee"
  | "move"
  | "fill"
  | "transform"
  | "watermarkMask";

export type MarqueeSubTool =
  | "lasso"
  | "object"
  | "freeRect"
  | "ratio1x1"
  | "ratio4x3"
  | "ratio16x9";

/** 영역 선택 결합 모드 (포토샵 스타일: 새로/추가/제거/교차) */
export type SelectionCombineMode = "new" | "add" | "subtract" | "intersect";

export type CropSizePivot =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "middleLeft"
  | "center"
  | "middleRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight";

// Re-export shared AspectRatio types
export type { AspectRatio, AspectRatioOption } from "../../../shared/types/aspectRatio";
export { ASPECT_RATIOS, ASPECT_RATIO_VALUES } from "../../../shared/types/aspectRatio";

export type OutputFormat = "webp" | "jpeg" | "png" | "svg";

export type DragType = "create" | "move" | "resize" | "pan" | "draw" | "guide" | null;

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionMask {
  x: number;
  y: number;
  width: number;
  height: number;
  mask: Uint8Array;
}

export type TextAlign = "left" | "center" | "right";
export type TextVerticalAlign = "top" | "middle" | "bottom";

export interface TextDraft {
  layerId?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

export interface TextStyleSettings {
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textAlign: TextAlign;
  verticalAlign: TextVerticalAlign;
  color: string;
  lineHeight: number;
  letterSpacing: number;
  backgroundColor: string | null;
  strokeColor: string;
  strokeWidth: number;
}

/**
 * SavedImageProject: Saved project data for image editor
 */
export interface SavedImageProject {
  id: string;
  name: string;
  projectGroup?: string;
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
  brushOpacity?: number;
  // UI state (optional for backward compatibility)
  showRulers?: boolean;
  showGuides?: boolean;
  lockGuides?: boolean;
  snapToGuides?: boolean;
  isPanLocked?: boolean;
}
