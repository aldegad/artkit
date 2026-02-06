// Clip types
export type {
  BaseClip,
  VideoClip,
  AudioClip,
  ImageClip,
  Clip,
  ClipboardData,
} from "./clip";
export {
  createVideoClip,
  createAudioClip,
  createImageClip,
  getSourceTime,
  isTimeInClip,
} from "./clip";

// Track types
export type { VideoTrack } from "./track";
export { createVideoTrack, createAudioTrack, DEFAULT_TRACK_HEIGHT } from "./track";

// Timeline types
export type {
  TimelineViewState,
  TimelineDragType,
  TimelineDragState,
  TimelineSelection,
} from "./timeline";
export { INITIAL_TIMELINE_VIEW, INITIAL_TIMELINE_SELECTION } from "./timeline";

// Mask types
export type {
  MaskKeyframe,
  MaskEasing,
  MaskData,
  MaskBrushSettings,
} from "./mask";
export { createMaskData, DEFAULT_MASK_BRUSH } from "./mask";

// Project types
export type {
  AssetReference,
  VideoProject,
  SavedVideoProject,
  VideoToolMode,
  PlaybackState,
} from "./project";
export { createVideoProject, INITIAL_PLAYBACK_STATE } from "./project";
