// ============================================
// Sprite Editor Autosave Utilities (IndexedDB)
// ============================================

import { createAutosave, type BaseAutosaveData } from "../../../shared/utils";
import { Point, Size, SpriteTrack } from "../types";

export const AUTOSAVE_KEY = "sprite-editor-autosave";
export const AUTOSAVE_DEBOUNCE_MS = 1000;

export interface AutosaveData extends BaseAutosaveData {
  imageSrc: string | null;
  imageSize: Size;
  tracks: SpriteTrack[];
  nextFrameId: number;
  fps: number;
  currentFrameIndex: number;
  zoom: number;
  pan: Point;
  scale: number;
  projectName: string;
}

// Create autosave storage using shared abstraction
const spriteAutosave = createAutosave<AutosaveData>({
  key: AUTOSAVE_KEY,
  dbName: "sprite-autosave-db",
  storeName: "autosave",
  dbVersion: 2, // Bump version to force fresh DB
});

/**
 * Load autosave data from IndexedDB
 */
export async function loadAutosaveData(): Promise<AutosaveData | null> {
  try {
    const data = await spriteAutosave.load();
    // If data has no tracks array, it's old format — discard
    if (data && !Array.isArray(data.tracks)) {
      await spriteAutosave.clear();
      return null;
    }
    return data;
  } catch {
    // Corrupted data — clear and return null
    await spriteAutosave.clear();
    return null;
  }
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
