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
// Re-exports from domain types
// ============================================

export type { UnifiedLayer } from "../shared/types/layers";
export type { SavedImageProject } from "../domains/image/types";

// ============================================
// Tool Types
// ============================================

export type ToolMode = "pen" | "select" | "hand" | "brush" | "eyedropper";

export type TimelineMode = "reorder" | "offset";

// ============================================
// Re-exports from shared types
// ============================================

export type { BoundingBox } from "../shared/types/common";
