// ============================================
// Sprite Editor Autosave Utilities (localStorage)
// ============================================

import { createAutosave, type BaseAutosaveData } from "../../../shared/utils";
import { Point, Size, SpriteFrame, UnifiedLayer } from "../types";

export const AUTOSAVE_KEY = "sprite-editor-autosave";
export const AUTOSAVE_DEBOUNCE_MS = 1000;

export interface AutosaveData extends BaseAutosaveData {
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
  compositionLayers?: UnifiedLayer[];
  activeLayerId?: string | null;
}

// Create autosave storage using shared abstraction
const spriteAutosave = createAutosave<AutosaveData>({
  backend: "localStorage",
  key: AUTOSAVE_KEY,
});

/**
 * Load autosave data from localStorage
 */
export async function loadAutosaveData(): Promise<AutosaveData | null> {
  return spriteAutosave.load();
}

/**
 * Save autosave data to localStorage
 */
export async function saveAutosaveData(
  data: Omit<AutosaveData, "savedAt" | "id">
): Promise<void> {
  return spriteAutosave.save(data);
}

/**
 * Clear autosave data from localStorage
 */
export async function clearAutosaveData(): Promise<void> {
  return spriteAutosave.clear();
}
