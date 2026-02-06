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

  // Actions - Tool
  setSpriteToolMode: (mode: SpriteToolMode) => void;
  setIsSpacePressed: (pressed: boolean) => void;

  // Actions - Timeline
  setTimelineMode: (mode: TimelineMode) => void;

  // Actions - Brush
  setBrushColor: (color: string) => void;
  setBrushSize: (size: number) => void;

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

  // Tool Actions
  setSpriteToolMode: (mode) => set({ toolMode: mode }),
  setIsSpacePressed: (pressed) => set({ isSpacePressed: pressed }),

  // Timeline Actions
  setTimelineMode: (mode) => set({ timelineMode: mode }),

  // Brush Actions
  setBrushColor: (color) => set({ brushColor: color }),
  setBrushSize: (size) => set({ brushSize: size }),

  // Reset
  reset: () =>
    set({
      toolMode: "pen",
      isSpacePressed: false,
      timelineMode: "reorder",
      brushColor: "#000000",
      brushSize: 1,
    }),
}));
