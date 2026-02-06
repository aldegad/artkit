// ============================================
// Video Editor Autosave
// ============================================

import { createAutosave, BaseAutosaveData } from "@/shared/utils/autosave";
import {
  VideoProject,
  VideoTrack,
  Clip,
  MaskData,
  TimelineViewState,
  VideoToolMode,
} from "../types";
import { clearAllMediaBlobs } from "./mediaStorage";

export const VIDEO_AUTOSAVE_KEY = "video-autosave";
export const VIDEO_AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * Video editor autosave data structure
 */
export interface VideoAutosaveData extends BaseAutosaveData {
  // Project data
  project: VideoProject;
  projectName: string;

  // Timeline data
  tracks: VideoTrack[];
  clips: Clip[];
  masks: MaskData[];

  // View state
  timelineView: TimelineViewState;
  currentTime: number;

  // Tool state
  toolMode: VideoToolMode;
  selectedClipIds: string[];
  selectedMaskIds?: string[];
}

const videoAutosave = createAutosave<VideoAutosaveData>({
  key: VIDEO_AUTOSAVE_KEY,
  dbName: "video-autosave-db",
  storeName: "autosave",
  dbVersion: 1,
});

/**
 * Save video editor state to IndexedDB
 */
export const saveVideoAutosave = (
  data: Omit<VideoAutosaveData, "id" | "savedAt">
): Promise<void> => videoAutosave.save(data);

/**
 * Load video editor state from IndexedDB
 */
export const loadVideoAutosave = (): Promise<VideoAutosaveData | null> =>
  videoAutosave.load();

/**
 * Clear video editor autosave data and media blobs
 */
export const clearVideoAutosave = async (): Promise<void> => {
  await Promise.all([
    videoAutosave.clear(),
    clearAllMediaBlobs(),
  ]);
};
