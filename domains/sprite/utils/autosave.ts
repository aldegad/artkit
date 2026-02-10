// ============================================
// Sprite Editor Autosave Utilities (IndexedDB)
// ============================================

import { createAutosave, type BaseAutosaveData } from "../../../shared/utils";
import { Point, Size, SpriteTrack } from "../types";
import { migrateAutosaveV1ToV2 } from "./migration";

export const AUTOSAVE_KEY = "sprite-editor-autosave";
export const AUTOSAVE_DEBOUNCE_MS = 1000;

export interface AutosaveData extends BaseAutosaveData {
  currentProjectId?: string | null;
  imageSrc: string | null;
  imageSize: Size;
  tracks: SpriteTrack[];
  nextFrameId: number;
  fps: number;
  zoom: number;
  pan: Point;
  scale: number;
  projectName: string;
  // Legacy fields from older autosave versions (ignored on restore)
  currentFrameIndex?: number;
  isPlaying?: boolean;
  // Per-panel viewport state (added later, optional for backwards compat)
  animPreviewZoom?: number;
  animPreviewPan?: Point;
  frameEditZoom?: number;
  frameEditPan?: Point;
}

// Create autosave storage using shared abstraction
const spriteAutosave = createAutosave<AutosaveData>({
  key: AUTOSAVE_KEY,
  dbName: "sprite-editor-autosave-db",
  storeName: "autosave",
  dbVersion: 2, // Bump version to force fresh DB
});

/**
 * Load autosave data from IndexedDB
 */
export async function loadAutosaveData(): Promise<AutosaveData | null> {
  try {
    const data = await spriteAutosave.load();
    if (!data) return null;

    // V1 format (flat frames) → migrate to V2 (tracks)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const migratedTracks = migrateAutosaveV1ToV2(data as any);
    if (migratedTracks) {
      data.tracks = migratedTracks;
    }

    // Still no tracks → corrupted data
    if (!Array.isArray(data.tracks)) {
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
