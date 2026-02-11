import { create } from "zustand";
import { SpriteToolMode, TimelineMode, FrameEditToolMode, SpriteCropArea, SpriteCropAspectRatio } from "../types";
import type { BrushPreset } from "@/domains/image/types/brush";
import { DEFAULT_BRUSH_PRESETS } from "@/domains/image/constants/brushPresets";

// ============================================
// Types
// ============================================

interface SpriteToolStore {
  // Tool State
  toolMode: SpriteToolMode;
  frameEditToolMode: FrameEditToolMode;
  isSpacePressed: boolean;
  isPanLocked: boolean;
  cropArea: SpriteCropArea | null;
  cropAspectRatio: SpriteCropAspectRatio;
  lockCropAspect: boolean;
  canvasExpandMode: boolean;

  // Timeline
  timelineMode: TimelineMode;

  // Brush Tool
  brushColor: string;
  brushSize: number;
  brushHardness: number;
  magicWandTolerance: number;
  magicWandFeather: number;
  activePreset: BrushPreset;
  presets: BrushPreset[];
  pressureEnabled: boolean;

  // Actions - Tool
  setSpriteToolMode: (mode: SpriteToolMode) => void;
  setFrameEditToolMode: (mode: FrameEditToolMode) => void;
  setIsSpacePressed: (pressed: boolean) => void;
  setIsPanLocked: (locked: boolean) => void;
  setCropArea: (area: SpriteCropArea | null) => void;
  setCropAspectRatio: (ratio: SpriteCropAspectRatio) => void;
  setLockCropAspect: (locked: boolean) => void;
  setCanvasExpandMode: (enabled: boolean) => void;

  // Actions - Timeline
  setTimelineMode: (mode: TimelineMode) => void;

  // Actions - Brush
  setBrushColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setBrushHardness: (hardness: number) => void;
  setMagicWandTolerance: (tolerance: number) => void;
  setMagicWandFeather: (feather: number) => void;
  setActivePreset: (preset: BrushPreset) => void;
  setPressureEnabled: (enabled: boolean) => void;

  // Reset
  reset: () => void;
}

function normalizeMagicWandFeather(feather: number): number {
  const clamped = Math.max(0, Math.min(32, feather));
  return Math.round(clamped * 2) / 2;
}

// ============================================
// Store
// ============================================

export const useSpriteToolStore = create<SpriteToolStore>((set) => ({
  // Initial State
  toolMode: "brush",
  frameEditToolMode: "brush",
  isSpacePressed: false,
  isPanLocked: false,
  cropArea: null,
  cropAspectRatio: "free",
  lockCropAspect: false,
  canvasExpandMode: false,
  timelineMode: "reorder",
  brushColor: "#000000",
  brushSize: DEFAULT_BRUSH_PRESETS[0].defaultSize,
  brushHardness: DEFAULT_BRUSH_PRESETS[0].defaultHardness,
  magicWandTolerance: 24,
  magicWandFeather: 0,
  activePreset: DEFAULT_BRUSH_PRESETS[0],
  presets: [...DEFAULT_BRUSH_PRESETS],
  pressureEnabled: true,

  // Tool Actions
  setSpriteToolMode: (mode) =>
    set(() => {
      if (mode === "brush" || mode === "eraser" || mode === "magicwand" || mode === "eyedropper" || mode === "zoom") {
        return {
          toolMode: mode,
          frameEditToolMode: mode,
        };
      }
      if (mode === "crop") {
        return {
          toolMode: mode,
          frameEditToolMode: mode,
        };
      }
      return { toolMode: mode };
    }),
  setFrameEditToolMode: (mode) => set({ frameEditToolMode: mode, toolMode: mode }),
  setIsSpacePressed: (pressed) => set({ isSpacePressed: pressed }),
  setIsPanLocked: (locked) => set({ isPanLocked: locked }),
  setCropArea: (area) => set({ cropArea: area }),
  setCropAspectRatio: (ratio) => set({ cropAspectRatio: ratio }),
  setLockCropAspect: (locked) => set({ lockCropAspect: locked }),
  setCanvasExpandMode: (enabled) => set({ canvasExpandMode: enabled }),

  // Timeline Actions
  setTimelineMode: (mode) => set({ timelineMode: mode }),

  // Brush Actions
  setBrushColor: (color) => set({ brushColor: color }),
  setBrushSize: (size) => set({ brushSize: size }),
  setBrushHardness: (hardness) => set({ brushHardness: hardness }),
  setMagicWandTolerance: (tolerance) =>
    set({ magicWandTolerance: Math.max(0, Math.min(255, Math.round(tolerance))) }),
  setMagicWandFeather: (feather) =>
    set({ magicWandFeather: normalizeMagicWandFeather(feather) }),
  setActivePreset: (preset) =>
    set({
      activePreset: preset,
      brushSize: preset.defaultSize,
      brushHardness: preset.defaultHardness,
    }),
  setPressureEnabled: (enabled) => set({ pressureEnabled: enabled }),

  // Reset
  reset: () =>
    set({
      toolMode: "brush",
      frameEditToolMode: "brush",
      isSpacePressed: false,
      isPanLocked: false,
      cropArea: null,
      cropAspectRatio: "free",
      lockCropAspect: false,
      canvasExpandMode: false,
      timelineMode: "reorder",
      brushColor: "#000000",
      brushSize: DEFAULT_BRUSH_PRESETS[0].defaultSize,
      brushHardness: DEFAULT_BRUSH_PRESETS[0].defaultHardness,
      magicWandTolerance: 24,
      magicWandFeather: 0,
      activePreset: DEFAULT_BRUSH_PRESETS[0],
      presets: [...DEFAULT_BRUSH_PRESETS],
      pressureEnabled: true,
    }),
}));
