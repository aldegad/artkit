import { create } from "zustand";
import { Point } from "../types";

// ============================================
// Types
// ============================================

interface SpriteViewportStore {
  // State (zoom/pan/scale synced from useCanvasViewport for autosave)
  zoom: number;
  pan: Point;
  scale: number;
  canvasHeight: number;
  isCanvasCollapsed: boolean;

  // Actions
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setPan: (pan: Point | ((prev: Point) => Point)) => void;
  setScale: (scale: number) => void;
  setCanvasHeight: (height: number | ((prev: number) => number)) => void;
  setIsCanvasCollapsed: (collapsed: boolean) => void;

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
    }),
}));
