import { create } from "zustand";
import { Point } from "../types";

// ============================================
// Types
// ============================================

interface SpriteViewportStore {
  // State
  zoom: number;
  pan: Point;
  scale: number;
  canvasHeight: number;
  isCanvasCollapsed: boolean;
  previewZoom: number;
  previewPan: Point;
  frameEditZoom: number;
  frameEditPan: Point;

  // Actions
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setPan: (pan: Point | ((prev: Point) => Point)) => void;
  setScale: (scale: number) => void;
  setCanvasHeight: (height: number | ((prev: number) => number)) => void;
  setIsCanvasCollapsed: (collapsed: boolean) => void;
  setPreviewZoom: (zoom: number | ((prev: number) => number)) => void;
  setPreviewPan: (pan: Point | ((prev: Point) => Point)) => void;
  setFrameEditZoom: (zoom: number | ((prev: number) => number)) => void;
  setFrameEditPan: (pan: Point | ((prev: Point) => Point)) => void;

  // Computed
  getTransformParams: () => { scale: number; zoom: number; pan: Point };

  // Reset
  reset: () => void;
}

// ============================================
// Store
// ============================================

export const useSpriteViewportStore = create<SpriteViewportStore>((set, get) => ({
  // Initial State
  zoom: 1,
  pan: { x: 0, y: 0 },
  scale: 1,
  canvasHeight: 400,
  isCanvasCollapsed: false,
  previewZoom: 2,
  previewPan: { x: 0, y: 0 },
  frameEditZoom: 3,
  frameEditPan: { x: 0, y: 0 },

  // Actions
  setZoom: (zoomOrFn) =>
    set((state) => ({
      zoom: typeof zoomOrFn === "function" ? zoomOrFn(state.zoom) : zoomOrFn,
    })),

  setPan: (panOrFn) =>
    set((state) => ({
      pan: typeof panOrFn === "function" ? panOrFn(state.pan) : panOrFn,
    })),

  setScale: (scale) => set({ scale }),

  setCanvasHeight: (heightOrFn) =>
    set((state) => ({
      canvasHeight: typeof heightOrFn === "function" ? heightOrFn(state.canvasHeight) : heightOrFn,
    })),

  setIsCanvasCollapsed: (collapsed) => set({ isCanvasCollapsed: collapsed }),

  setPreviewZoom: (zoomOrFn) =>
    set((state) => ({
      previewZoom: typeof zoomOrFn === "function" ? zoomOrFn(state.previewZoom) : zoomOrFn,
    })),

  setPreviewPan: (panOrFn) =>
    set((state) => ({
      previewPan: typeof panOrFn === "function" ? panOrFn(state.previewPan) : panOrFn,
    })),

  setFrameEditZoom: (zoomOrFn) =>
    set((state) => ({
      frameEditZoom: typeof zoomOrFn === "function" ? zoomOrFn(state.frameEditZoom) : zoomOrFn,
    })),

  setFrameEditPan: (panOrFn) =>
    set((state) => ({
      frameEditPan: typeof panOrFn === "function" ? panOrFn(state.frameEditPan) : panOrFn,
    })),

  // Computed
  getTransformParams: () => {
    const { scale, zoom, pan } = get();
    return { scale, zoom, pan };
  },

  // Reset
  reset: () =>
    set({
      zoom: 1,
      pan: { x: 0, y: 0 },
      scale: 1,
      canvasHeight: 400,
      isCanvasCollapsed: false,
      previewZoom: 2,
      previewPan: { x: 0, y: 0 },
      frameEditZoom: 3,
      frameEditPan: { x: 0, y: 0 },
    }),
}));
