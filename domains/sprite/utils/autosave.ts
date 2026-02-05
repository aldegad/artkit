// ============================================
// Sprite Editor Autosave Utilities (IndexedDB)
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
  key: AUTOSAVE_KEY,
  dbName: "sprite-autosave-db",
  storeName: "autosave",
  dbVersion: 1,
});

/**
 * Load autosave data from IndexedDB
 */
export async function loadAutosaveData(): Promise<AutosaveData | null> {
  return spriteAutosave.load();
}

/**
 * Save autosave data to IndexedDB
 */
export async function saveAutosaveData(
  data: Omit<AutosaveData, "savedAt" | "id">
): Promise<void> {
  return spriteAutosave.save(data);
}

/**
 * Clear autosave data from IndexedDB
 */
export async function clearAutosaveData(): Promise<void> {
  return spriteAutosave.clear();
}
