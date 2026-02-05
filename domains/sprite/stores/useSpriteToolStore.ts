import { create } from "zustand";
import { SpriteToolMode, TimelineMode } from "../types";

// ============================================
// Types
// ============================================

interface SpriteToolStore {
  // Tool State
  toolMode: SpriteToolMode;
  isSpacePressed: boolean;

  // Timeline
  timelineMode: TimelineMode;

  // Brush Tool
  brushColor: string;
  brushSize: number;

  // Background Removal
  isBackgroundRemovalMode: boolean;
  eraserTolerance: number;
  eraserMode: "connected" | "all";

  // Actions - Tool
  setSpriteToolMode: (mode: SpriteToolMode) => void;
  setIsSpacePressed: (pressed: boolean) => void;

  // Actions - Timeline
  setTimelineMode: (mode: TimelineMode) => void;

  // Actions - Brush
  setBrushColor: (color: string) => void;
  setBrushSize: (size: number) => void;

  // Actions - Background Removal
  setIsBackgroundRemovalMode: (mode: boolean) => void;
  setEraserTolerance: (tolerance: number) => void;
  setEraserMode: (mode: "connected" | "all") => void;

  // Reset
  reset: () => void;
}

// ============================================
// Store
// ============================================

export const useSpriteToolStore = create<SpriteToolStore>((set) => ({
  // Initial State
  toolMode: "pen",
  isSpacePressed: false,
  timelineMode: "reorder",
  brushColor: "#000000",
  brushSize: 1,
  isBackgroundRemovalMode: false,
  eraserTolerance: 32,
  eraserMode: "connected",

  // Tool Actions
  setSpriteToolMode: (mode) => set({ toolMode: mode }),
  setIsSpacePressed: (pressed) => set({ isSpacePressed: pressed }),

  // Timeline Actions
  setTimelineMode: (mode) => set({ timelineMode: mode }),

  // Brush Actions
  setBrushColor: (color) => set({ brushColor: color }),
  setBrushSize: (size) => set({ brushSize: size }),

  // Background Removal Actions
  setIsBackgroundRemovalMode: (mode) => set({ isBackgroundRemovalMode: mode }),
  setEraserTolerance: (tolerance) => set({ eraserTolerance: tolerance }),
  setEraserMode: (mode) => set({ eraserMode: mode }),

  // Reset
  reset: () =>
    set({
      toolMode: "pen",
      isSpacePressed: false,
      timelineMode: "reorder",
      brushColor: "#000000",
      brushSize: 1,
      isBackgroundRemovalMode: false,
      eraserTolerance: 32,
      eraserMode: "connected",
    }),
}));
