/**
 * Video track containing multiple clips
 */
export interface VideoTrack {
  id: string;
  name: string;
  type: "video" | "audio";
  zIndex: number; // Layer order (higher = on top)
  visible: boolean;
  locked: boolean;
  muted: boolean; // For audio
  height: number; // Track height in timeline (pixels)
}

/**
 * Create a new video track
 */
export function createVideoTrack(name: string, zIndex: number): VideoTrack {
  return {
    id: crypto.randomUUID(),
    name,
    type: "video",
    zIndex,
    visible: true,
    locked: false,
    muted: false,
    height: 60,
  };
}

/**
 * Default track height
 */
export const DEFAULT_TRACK_HEIGHT = 60;
