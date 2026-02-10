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
 * Create a new track
 */
export function createVideoTrack(
  name: string,
  zIndex: number,
  type: "video" | "audio" = "video"
): VideoTrack {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    zIndex,
    visible: true,
    locked: false,
    muted: false,
    height: DEFAULT_TRACK_HEIGHT,
  };
}

export function createAudioTrack(name: string, zIndex: number): VideoTrack {
  return createVideoTrack(name, zIndex, "audio");
}

/**
 * Default track height
 */
export const DEFAULT_TRACK_HEIGHT = 45;
