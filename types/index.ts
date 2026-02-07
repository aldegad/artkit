// ============================================
// Core Types
// ============================================

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface SpriteFrame {
  id: number;
  points: Point[];
  name: string;
  imageData?: string;
  offset: Point;
}

export interface SpriteTrack {
  id: string;
  name: string;
  frames: SpriteFrame[];
  visible: boolean;
  locked: boolean;
  opacity: number;
  zIndex: number;
  loop: boolean;
}

export interface ViewState {
  zoom: number;
  pan: Point;
  scale: number;
  canvasHeight: number;
  isCanvasCollapsed: boolean;
  isPreviewWindowOpen: boolean;
  currentFrameIndex: number;
  timelineMode: TimelineMode;
}

export interface SavedProject {
  id: string;
  name: string;
  imageSrc: string;
  imageSize: Size;
  tracks: SpriteTrack[];
  nextFrameId: number;
  fps: number;
  savedAt: number;
  viewState?: ViewState;
}

// ============================================
// Unified Layer System
// ============================================

/**
 * UnifiedLayer: All layers are pixel-based (paint layers)
 * Images imported are drawn onto the layer canvas
 */
export interface UnifiedLayer {
  id: string;
  name: string;
  type: "paint"; // All layers are paint layers now
  visible: boolean;
  locked: boolean;
  opacity: number;
  zIndex: number;
  // Canvas data
  paintData?: string;
  // Optional transform
  position?: Point;
  scale?: number;
  rotation?: number;
  originalSize?: Size;
}

// ============================================
// Saved Image Project
// ============================================

export interface SavedImageProject {
  id: string;
  name: string;
  unifiedLayers: UnifiedLayer[];
  activeLayerId?: string;
  canvasSize: Size;
  rotation: number;
  savedAt: number;
  thumbnailUrl?: string; // For list view
  guides?: import("../domains/editor/types/guides").Guide[]; // Guide lines (optional for backward compatibility)
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

// ============================================
// Tool Types
// ============================================

export type ToolMode = "pen" | "select" | "hand" | "brush" | "eyedropper";

export type TimelineMode = "reorder" | "offset";

// ============================================
// Re-exports from shared types
// ============================================

export type { BoundingBox } from "../shared/types/common";
