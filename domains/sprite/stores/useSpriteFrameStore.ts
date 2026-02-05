import { create } from "zustand";
import { Point, SpriteFrame } from "../types";
import { deepCopyFrames } from "../utils/frameUtils";

// ============================================
// Types
// ============================================

interface SpriteFrameStore {
  // Image
  imageSrc: string | null;
  imageSize: { width: number; height: number };

  // Frames
  frames: SpriteFrame[];
  nextFrameId: number;
  currentFrameIndex: number;
  selectedFrameId: number | null;
  selectedPointIndex: number | null;
  currentPoints: Point[];

  // Animation
  isPlaying: boolean;
  fps: number;

  // History (internal refs managed via closures)
  canUndo: boolean;
  canRedo: boolean;

  // Actions - Image
  setImageSrc: (src: string | null) => void;
  setImageSize: (size: { width: number; height: number }) => void;

  // Actions - Frames
  setFrames: (frames: SpriteFrame[] | ((prev: SpriteFrame[]) => SpriteFrame[])) => void;
  setNextFrameId: (id: number | ((prev: number) => number)) => void;
  setCurrentFrameIndex: (index: number | ((prev: number) => number)) => void;
  setSelectedFrameId: (id: number | null) => void;
  setSelectedPointIndex: (index: number | null) => void;
  setCurrentPoints: (points: Point[] | ((prev: Point[]) => Point[])) => void;

  // Actions - Animation
  setIsPlaying: (playing: boolean) => void;
  setFps: (fps: number) => void;

  // Actions - History
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Actions - Reset
  reset: () => void;
}

// ============================================
// History Management (closure-based)
// ============================================

const historyStack: SpriteFrame[][] = [];
let historyIndex = -1;
let hasUnsavedChanges = false;

// ============================================
// Store
// ============================================

export const useSpriteFrameStore = create<SpriteFrameStore>((set, get) => ({
  // Initial State
  imageSrc: null,
  imageSize: { width: 0, height: 0 },
  frames: [],
  nextFrameId: 1,
  currentFrameIndex: 0,
  selectedFrameId: null,
  selectedPointIndex: null,
  currentPoints: [],
  isPlaying: false,
  fps: 12,
  canUndo: false,
  canRedo: false,

  // Image Actions
  setImageSrc: (src) => set({ imageSrc: src }),
  setImageSize: (size) => set({ imageSize: size }),

  // Frame Actions
  setFrames: (framesOrFn) =>
    set((state) => ({
      frames: typeof framesOrFn === "function" ? framesOrFn(state.frames) : framesOrFn,
    })),

  setNextFrameId: (idOrFn) =>
    set((state) => ({
      nextFrameId: typeof idOrFn === "function" ? idOrFn(state.nextFrameId) : idOrFn,
    })),

  setCurrentFrameIndex: (indexOrFn) =>
    set((state) => ({
      currentFrameIndex: typeof indexOrFn === "function" ? indexOrFn(state.currentFrameIndex) : indexOrFn,
    })),

  setSelectedFrameId: (id) => set({ selectedFrameId: id }),
  setSelectedPointIndex: (index) => set({ selectedPointIndex: index }),

  setCurrentPoints: (pointsOrFn) =>
    set((state) => ({
      currentPoints: typeof pointsOrFn === "function" ? pointsOrFn(state.currentPoints) : pointsOrFn,
    })),

  // Animation Actions
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setFps: (fps) => set({ fps }),

  // History Actions
  pushHistory: () => {
    const { frames } = get();

    // Remove future history if not at the end
    if (historyIndex < historyStack.length - 1) {
      historyStack.length = historyIndex + 1;
    }

    // Save current state before the change
    historyStack.push(deepCopyFrames(frames));
    historyIndex = historyStack.length - 1;
    hasUnsavedChanges = true;

    // Limit history to 50 items
    if (historyStack.length > 50) {
      historyStack.shift();
      historyIndex--;
    }

    set({ canUndo: true, canRedo: false });
  },

  undo: () => {
    const { frames } = get();

    if (historyStack.length > 0 && historyIndex >= 0) {
      // Save current state for redo if there are unsaved changes
      if (hasUnsavedChanges && historyIndex === historyStack.length - 1) {
        historyStack.push(deepCopyFrames(frames));
        hasUnsavedChanges = false;
      }

      // Restore previous state
      const prevFrames = historyStack[historyIndex];
      historyIndex--;

      set({
        frames: deepCopyFrames(prevFrames),
        canUndo: historyIndex >= 0,
        canRedo: true,
      });
    }
  },

  redo: () => {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++;
      const nextFrames = historyStack[historyIndex];

      set({
        frames: deepCopyFrames(nextFrames),
        canUndo: true,
        canRedo: historyIndex < historyStack.length - 1,
      });
    }
  },

  // Reset
  reset: () => {
    // Clear history
    historyStack.length = 0;
    historyIndex = -1;
    hasUnsavedChanges = false;

    set({
      imageSrc: null,
      imageSize: { width: 0, height: 0 },
      frames: [],
      nextFrameId: 1,
      currentFrameIndex: 0,
      selectedFrameId: null,
      selectedPointIndex: null,
      currentPoints: [],
      isPlaying: false,
      fps: 12,
      canUndo: false,
      canRedo: false,
    });
  },
}));
