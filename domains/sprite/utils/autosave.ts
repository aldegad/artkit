// ============================================
// Sprite Editor Autosave Utilities (IndexedDB)
// ============================================

import { createAutosave, type BaseAutosaveData } from "../../../shared/utils";
import { Point, Size, SpriteTrack } from "../types";
import { migrateAutosaveV1ToV2 } from "./migration";

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
  // Per-panel viewport state (added later, optional for backwards compat)
  animPreviewZoom?: number;
  animPreviewPan?: Point;
  frameEditZoom?: number;
  frameEditPan?: Point;
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
    if (!data) {
      console.log("[Sprite Autosave] LOAD: No saved data found");
      return null;
    }

    // V1 format (flat frames) → migrate to V2 (tracks)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const migratedTracks = migrateAutosaveV1ToV2(data as any);
    if (migratedTracks) {
      data.tracks = migratedTracks;
    }

    // Still no tracks → corrupted data
    if (!Array.isArray(data.tracks)) {
      console.warn("[Sprite Autosave] LOAD: Corrupted data (no tracks), clearing");
      await spriteAutosave.clear();
      return null;
    }

    console.log("[Sprite Autosave] LOAD:", {
      imageSize: data.imageSize,
      zoom: data.zoom,
      pan: data.pan,
      scale: data.scale,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvasHeight: (data as any).canvasHeight,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isCanvasCollapsed: (data as any).isCanvasCollapsed,
      tracksCount: data.tracks.length,
      fps: data.fps,
      currentFrameIndex: data.currentFrameIndex,
      projectName: data.projectName,
      animPreviewZoom: data.animPreviewZoom,
      animPreviewPan: data.animPreviewPan,
      frameEditZoom: data.frameEditZoom,
      frameEditPan: data.frameEditPan,
      savedAt: data.savedAt,
    });

    return data;
  } catch {
    // Corrupted data — clear and return null
    console.error("[Sprite Autosave] LOAD: Error loading data, clearing");
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
  console.log("[Sprite Autosave] SAVE:", {
    imageSize: data.imageSize,
    zoom: data.zoom,
    pan: data.pan,
    scale: data.scale,
    tracksCount: data.tracks.length,
    fps: data.fps,
    currentFrameIndex: data.currentFrameIndex,
    projectName: data.projectName,
    animPreviewZoom: data.animPreviewZoom,
    animPreviewPan: data.animPreviewPan,
    frameEditZoom: data.frameEditZoom,
    frameEditPan: data.frameEditPan,
  });
  return spriteAutosave.save(data);
}

/**
 * Clear autosave data from IndexedDB
 */
export async function clearAutosaveData(): Promise<void> {
  return spriteAutosave.clear();
}
