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
 * UnifiedLayer: Single layer type that can hold both image and paint data
 */
export interface UnifiedLayer {
  id: string;
  name: string;
  type: "image" | "paint";
  visible: boolean;
  locked: boolean;
  opacity: number;
  zIndex: number;
  // For image layers
  imageSrc?: string;
  position?: Point;
  scale?: number;
  rotation?: number;
  originalSize?: Size;
  // For paint layers
  paintData?: string;
}

// ============================================
// Image Editor Types (Legacy - kept for backward compatibility)
// ============================================

/** @deprecated Use UnifiedLayer instead */
export interface ImageLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  data: string;
}

/** @deprecated Use UnifiedLayer instead */
export interface CompositionLayer {
  id: string;
  name: string;
  imageSrc: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  position: Point;
  scale: number;
  rotation: number;
  zIndex: number;
  originalSize: Size;
}

// ============================================
// Saved Image Project
// ============================================

export interface SavedImageProject {
  id: string;
  name: string;
  imageSrc: string;
  // New unified layer system
  unifiedLayers?: UnifiedLayer[];
  activeLayerId?: string;
  canvasSize?: Size;
  imageSize: Size;
  rotation: number;
  savedAt: number;
  // Legacy fields (for backward compatibility)
  editLayerData?: string;
  layers?: ImageLayer[];
  compositionLayers?: CompositionLayer[];
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
// Bounding Box
// ============================================

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}
