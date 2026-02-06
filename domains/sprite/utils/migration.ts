// ============================================
// Sprite Project Migration (V1 → V2)
// ============================================

import { SpriteFrame, SpriteTrack } from "../types";

/**
 * Migrate V1 flat frames to V2 track-based format.
 * Wraps existing frames into a single "Track 1".
 */
export function migrateV1ToV2(frames: SpriteFrame[], nextFrameId: number): {
  tracks: SpriteTrack[];
  nextFrameId: number;
} {
  if (frames.length === 0) {
    return { tracks: [], nextFrameId };
  }

  const track: SpriteTrack = {
    id: `track-migrated-${Date.now()}`,
    name: "Track 1",
    frames: [...frames],
    visible: true,
    locked: false,
    opacity: 100,
    zIndex: 0,
    loop: false,
  };

  return {
    tracks: [track],
    nextFrameId,
  };
}

/**
 * Check if autosave data needs migration.
 * Returns V2 tracks, migrating from V1 if necessary.
 */
export function ensureV2Format(data: {
  frames?: SpriteFrame[];
  tracks?: SpriteTrack[];
  nextFrameId?: number;
  version?: number;
}): { tracks: SpriteTrack[]; nextFrameId: number } {
  // Already V2
  if (data.version === 2 && data.tracks) {
    return {
      tracks: data.tracks,
      nextFrameId: data.nextFrameId ?? 1,
    };
  }

  // V1 or unversioned - migrate
  if (data.frames && data.frames.length > 0) {
    return migrateV1ToV2(data.frames, data.nextFrameId ?? 1);
  }

  // Empty project
  return { tracks: [], nextFrameId: data.nextFrameId ?? 1 };
}
