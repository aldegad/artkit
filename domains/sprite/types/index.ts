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
  frames: SpriteFrame[];
  nextFrameId: number;
  fps: number;
  savedAt: number;
  viewState?: ViewState;
}

// Docking types are defined in layout.ts and re-exported above

// ============================================
// Editor State (for SpriteEditorContext)
// ============================================

export interface SpriteEditorState {
  // Image
  imageSrc: string | null;
  imageSize: Size;

  // Frames
  frames: SpriteFrame[];
  nextFrameId: number;
  currentFrameIndex: number;
  selectedFrameId: number | null;
  selectedPointIndex: number | null;

  // Tools
  toolMode: SpriteToolMode;
  currentPoints: Point[]; // Pen tool points

  // View
  zoom: number;
  pan: Point;
  scale: number;
  canvasHeight: number;
  isCanvasCollapsed: boolean;

  // Animation
  isPlaying: boolean;
  fps: number;

  // Timeline
  timelineMode: TimelineMode;

  // Project
  projectName: string;
  currentProjectId: string | null;
}
