// ============================================
// Sprite Editor Autosave Utilities
// ============================================

import { Point, Size, SpriteFrame, CompositionLayer } from "../types";

export const AUTOSAVE_KEY = "sprite-editor-autosave";
export const AUTOSAVE_DEBOUNCE_MS = 1000;

export interface AutosaveData {
  imageSrc: string | null;
  imageSize: Size;
  frames: SpriteFrame[];
  nextFrameId: number;
  fps: number;
  currentFrameIndex: number;
  zoom: number;
  pan: Point;
  scale: number;
  projectName: string;
  savedAt: number;
  compositionLayers?: CompositionLayer[];
  activeLayerId?: string | null;
}

/**
 * Load autosave data from localStorage
 */
export function loadAutosaveData(): AutosaveData | null {
  if (typeof window === "undefined") return null;

  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) {
      const data: AutosaveData = JSON.parse(saved);
      console.log("[Autosave] Loaded saved data from", new Date(data.savedAt).toLocaleString());
      return data;
    }
  } catch (error) {
    console.error("[Autosave] Failed to load saved data:", error);
  }
  return null;
}

/**
 * Save autosave data to localStorage
 */
export function saveAutosaveData(data: Omit<AutosaveData, "savedAt">): void {
  if (typeof window === "undefined") return;

  try {
    const dataWithTimestamp: AutosaveData = {
      ...data,
      savedAt: Date.now(),
    };

    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(dataWithTimestamp));
    console.log("[Autosave] Saved at", new Date().toLocaleTimeString());
  } catch (error) {
    console.error("[Autosave] Failed to save:", error);
  }
}

/**
 * Clear autosave data from localStorage
 */
export function clearAutosaveData(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(AUTOSAVE_KEY);
  console.log("[Autosave] Cleared autosave data");
}
