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
  frames: SpriteFrame[];
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
}

// ============================================
// Tool Types
// ============================================

export type ToolMode = "pen" | "select" | "hand" | "brush" | "eyedropper";

export type TimelineMode = "reorder" | "offset";

// ============================================
// Docking Types
// ============================================

export type DockPosition = "left" | "right" | "top" | "bottom";

export interface DockedPanel {
  id: string;
  title: string;
  size: number;
}

export interface FloatingWindow {
  id: string;
  title: string;
  position: Point;
  size: Size;
  isMinimized: boolean;
}

export interface DockingState {
  dockedPanels: Partial<Record<DockPosition, DockedPanel[]>>;
  floatingWindows: FloatingWindow[];
  activeDragWindow: string | null;
  activeDropZone: DockPosition | null;
}

// ============================================
// Context Types
// ============================================

export interface EditorState {
  imageSrc: string | null;
  imageSize: Size;
  frames: SpriteFrame[];
  nextFrameId: number;
  currentFrameIndex: number;
  selectedFrameId: number | null;
  selectedPointIndex: number | null;
  toolMode: ToolMode;
  currentPoints: Point[];
  zoom: number;
  pan: Point;
  scale: number;
  canvasHeight: number;
  isCanvasCollapsed: boolean;
  isPlaying: boolean;
  fps: number;
  timelineMode: TimelineMode;
  isBackgroundRemovalMode: boolean;
  eraserTolerance: number;
  projectName: string;
  currentProjectId: string | null;
}

// ============================================
// Re-exports from shared types
// ============================================

export type { BoundingBox } from "../shared/types/common";
