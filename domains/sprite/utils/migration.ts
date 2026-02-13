// ============================================
// Sprite Project Migration Utilities
// ============================================

import { SpriteFrame, SpriteTrack } from "../types";
import { generateLayerId } from "./frameUtils";

// ============================================
// V1 → V2 Migration
// ============================================

/**
 * V1 format: flat frames array
 * V2 format: multi-track (SpriteTrack[])
 */

interface V1AutosaveData {
  frames?: SpriteFrame[];
  tracks?: SpriteTrack[];
  [key: string]: unknown;
}

/**
 * Detect if data is V1 format (has flat frames, no tracks)
 */
export function isV1Format(data: V1AutosaveData): boolean {
  return Array.isArray(data.frames) && !Array.isArray(data.tracks);
}

/**
 * Migrate V1 flat frames to a single V2 track
 */
export function migrateFramesToTracks(frames: SpriteFrame[]): SpriteTrack[] {
  if (frames.length === 0) return [];

  return [
    {
      id: generateLayerId(),
      name: "Track 1",
      frames,
      canvasSize: undefined,
      visible: true,
      locked: false,
      opacity: 100,
      zIndex: 0,
      loop: false,
    },
  ];
}

/**
 * Migrate autosave data from V1 to V2 format.
 * Returns the tracks array (or null if no migration needed).
 */
export function migrateAutosaveV1ToV2(data: V1AutosaveData): SpriteTrack[] | null {
  if (!isV1Format(data)) return null;

  const frames = data.frames as SpriteFrame[];
  return migrateFramesToTracks(frames);
}
