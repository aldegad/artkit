// ============================================
// Mouse Handler Types
// ============================================

import { RefObject } from "react";
import { EditorToolMode, CropArea, Point, DragType, Guide, AspectRatio } from "../../types";
import { UnifiedLayer } from "@/shared/types/layers";

// ============================================
// Floating Layer (for selection operations)
// ============================================

export interface FloatingLayer {
  imageData: ImageData;
  x: number;
  y: number;
  originX: number;
  originY: number;
}

// ============================================
// Handler Context
// ============================================

export interface MouseEventContext {
  e: React.MouseEvent | React.PointerEvent;
  screenPos: Point;
  imagePos: Point;
  activeMode: EditorToolMode;
  inBounds: boolean;
  modifiers: {
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
  };
  displayDimensions: { width: number; height: number };
}

// ============================================
// Handler Result
// ============================================

export interface HandlerResult {
  handled: boolean;
  dragType?: DragType;
  dragStart?: Point;
}

// ============================================
// Shared Handler Options
// ============================================

export interface BaseHandlerOptions {
  // Refs
  canvasRef: RefObject<HTMLCanvasElement | null>;
  editCanvasRef: RefObject<HTMLCanvasElement | null>;
  imageRef: RefObject<HTMLImageElement | null>;

  // State
  zoom: number;
  pan: Point;
  rotation: number;
  canvasSize: { width: number; height: number };

  // Setters
  setZoom: (zoom: number) => void;
  setPan: React.Dispatch<React.SetStateAction<Point>>;

  // Helpers
  getDisplayDimensions: () => { width: number; height: number };
}

// ============================================
// Pan/Zoom Handler Options
// ============================================

export interface PanZoomHandlerOptions extends BaseHandlerOptions {}

// ============================================
// Guide Handler Options
// ============================================

export interface GuideHandlerOptions extends BaseHandlerOptions {
  guides?: Guide[];
  showGuides?: boolean;
  lockGuides?: boolean;
  moveGuide?: (id: string, newPosition: number) => void;
  removeGuide?: (id: string) => void;
  getGuideAtPosition?: (pos: Point, tolerance: number) => Guide | null;
}

// ============================================
// Brush Handler Options
// ============================================

export interface BrushHandlerOptions extends BaseHandlerOptions {
  activeLayerPosition?: { x: number; y: number } | null;
  drawOnEditCanvas: (x: number, y: number, isStart?: boolean, pressure?: number) => void;
  pickColor: (x: number, y: number, canvasRef: RefObject<HTMLCanvasElement | null>, zoom: number, pan: Point) => void;
  resetLastDrawPoint: () => void;
  stampSource: { x: number; y: number } | null;
  setStampSource: (source: { x: number; y: number } | null) => void;
  fillWithColor: () => void;
  saveToHistory: () => void;
}

// ============================================
// Selection Handler Options
// ============================================

export interface SelectionHandlerOptions extends BaseHandlerOptions {
  activeLayerPosition?: { x: number; y: number } | null;
  selection: CropArea | null;
  selectionFeather: number;
  setSelection: (selection: CropArea | null) => void;
  isMovingSelection: boolean;
  setIsMovingSelection: (value: boolean) => void;
  isDuplicating: boolean;
  setIsDuplicating: (value: boolean) => void;
  floatingLayerRef: RefObject<FloatingLayer | null>;
  dragStartOriginRef: RefObject<Point | null>;
  saveToHistory: () => void;
}

// ============================================
// Crop Handler Options
// ============================================

export interface CropHandlerOptions extends BaseHandlerOptions {
  cropArea: CropArea | null;
  setCropArea: (area: CropArea | null) => void;
  aspectRatio: AspectRatio;
  getAspectRatioValue: (ratio: AspectRatio) => number | null;
  canvasExpandMode: boolean;
  updateCropExpand: (x: number, y: number, startX: number, startY: number) => void;
}

// ============================================
// Move Handler Options
// ============================================

export interface MoveHandlerOptions extends BaseHandlerOptions {
  selection: CropArea | null;
  selectionFeather: number;
  setSelection: (selection: CropArea | null) => void;
  floatingLayerRef: RefObject<FloatingLayer | null>;
  dragStartOriginRef: RefObject<Point | null>;
  setIsMovingSelection: (value: boolean) => void;
  setIsDuplicating: (value: boolean) => void;
  activeLayerId?: string | null;
  activeLayerPosition?: { x: number; y: number } | null;
  updateLayerPosition?: (layerId: string, position: { x: number; y: number }) => void;
  updateMultipleLayerPositions?: (updates: Array<{ layerId: string; position: { x: number; y: number } }>) => void;
  saveToHistory: () => void;
  // Multi-layer support
  selectedLayerIds?: string[];
  layers?: UnifiedLayer[];
}

// ============================================
// Transform Handler Options
// ============================================

export interface TransformHandlerOptions {
  isTransformActive?: () => boolean;
  handleTransformMouseDown?: (imagePos: Point, modifiers: { shift: boolean; alt: boolean }) => string | null;
  handleTransformMouseMove?: (imagePos: Point, modifiers: { shift: boolean; alt: boolean }) => void;
  handleTransformMouseUp?: () => void;
}

// ============================================
// Helper
// ============================================

export const isInHandle = (pos: Point, handle: { x: number; y: number }, size: number = 10): boolean => {
  return Math.abs(pos.x - handle.x) <= size && Math.abs(pos.y - handle.y) <= size;
};

export function buildContext(
  e: React.MouseEvent | React.PointerEvent,
  screenPos: Point,
  imagePos: Point,
  activeMode: EditorToolMode,
  inBounds: boolean,
  displayDimensions: { width: number; height: number }
): MouseEventContext {
  return {
    e,
    screenPos,
    imagePos,
    activeMode,
    inBounds,
    modifiers: {
      shift: e.shiftKey,
      alt: e.altKey,
      ctrl: e.ctrlKey,
      meta: e.metaKey,
    },
    displayDimensions,
  };
}
