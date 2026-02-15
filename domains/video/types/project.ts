import { Size } from "@/shared/types";
import { Clip } from "./clip";
import { VideoTrack } from "./track";
import { MaskData } from "./mask";
import { TimelineViewState } from "./timeline";

/**
 * Asset reference for project
 */
export interface AssetReference {
  id: string;
  name: string;
  type: "video" | "image" | "audio";
  url: string;
  size: Size;
  duration?: number;
  thumbnailUrl?: string;
}

/**
 * Video project state
 */
export interface VideoProject {
  id: string;
  name: string;

  // Canvas/composition settings
  canvasSize: Size; // Output resolution
  frameRate: number; // FPS (24, 30, 60)
  duration: number; // Total project duration

  // Timeline data
  tracks: VideoTrack[];
  clips: Clip[];
  masks: MaskData[];

  // Asset references
  assets: AssetReference[];
}

/**
 * Saved project for persistence
 */
export interface SavedVideoProject {
  id: string;
  name: string;
  projectGroup?: string;
  project: VideoProject;

  // View state
  timelineView: TimelineViewState;
  currentTime: number;
  playbackRange?: PlaybackRangeState;

  // Metadata
  savedAt: number;
  thumbnailUrl?: string;
}

export interface PlaybackRangeState {
  loop: boolean;
  loopStart: number;
  loopEnd: number;
}

/**
 * Create a new video project
 */
export function createVideoProject(
  name: string = "Untitled Project",
  canvasSize: Size = { width: 1920, height: 1080 },
  frameRate: number = 30
): VideoProject {
  return {
    id: crypto.randomUUID(),
    name,
    canvasSize,
    frameRate,
    duration: 0,
    tracks: [],
    clips: [],
    masks: [],
    assets: [],
  };
}

/**
 * Video tool modes
 */
export type VideoToolMode =
  | "select"
  | "transform"
  | "hand"
  | "zoom"
  | "crop"
  | "trim"
  | "razor" // Split clip
  | "mask";

/**
 * Video playback state
 */
export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
}

export const INITIAL_PLAYBACK_STATE: PlaybackState = {
  isPlaying: false,
  currentTime: 0,
  playbackRate: 1,
  loop: false,
  loopStart: 0,
  loopEnd: 0,
};
