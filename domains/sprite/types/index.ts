// ============================================
// Sprite Domain Types
// ============================================

import { Point, Size } from "../../../shared/types";

// Re-export shared types for convenience
export type { Point, Size, UnifiedLayer, BoundingBox } from "../../../shared/types";

// Re-export layout types
export * from "./layout";

// ============================================
// Sprite-specific Types
// ============================================

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
  opacity: number; // 0-100
  zIndex: number; // higher = rendered on top
  loop: boolean; // loop when shorter than longest track
}

export type SpriteToolMode = "pen" | "select" | "hand";

export type TimelineMode = "reorder" | "offset";

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

export interface SavedSpriteProject {
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
