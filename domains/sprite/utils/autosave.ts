// ============================================
// Sprite Editor Autosave Utilities
// ============================================

import { Point, Size, SpriteFrame, UnifiedLayer } from "../types";

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
  compositionLayers?: UnifiedLayer[];
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
      return data;
    }
  } catch {
    // Failed to load saved data
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
  } catch {
    // Failed to save
  }
}

/**
 * Clear autosave data from localStorage
 */
export function clearAutosaveData(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(AUTOSAVE_KEY);
}
