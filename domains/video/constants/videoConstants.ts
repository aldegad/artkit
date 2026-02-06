/**
 * Video editor constants
 */

// Timeline constants
export const TIMELINE = {
  MIN_ZOOM: 10, // pixels per second
  MAX_ZOOM: 500,
  DEFAULT_ZOOM: 100,
  TRACK_MIN_HEIGHT: 40,
  TRACK_DEFAULT_HEIGHT: 60,
  TRACK_MAX_HEIGHT: 120,
  RULER_HEIGHT: 16,
  PLAYHEAD_WIDTH: 2,
  SNAP_THRESHOLD: 5, // pixels
  CLIP_MIN_DURATION: 0.1, // seconds
} as const;

// Preview constants
export const PREVIEW = {
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 4,
  DEFAULT_ZOOM: 1,
  CHECKERBOARD_SIZE: 10,
} as const;

// Mask brush constants
export const MASK_BRUSH = {
  MIN_SIZE: 1,
  MAX_SIZE: 500,
  DEFAULT_SIZE: 50,
  MIN_HARDNESS: 0,
  MAX_HARDNESS: 100,
  DEFAULT_HARDNESS: 80,
  MIN_OPACITY: 1,
  MAX_OPACITY: 100,
  DEFAULT_OPACITY: 100,
} as const;

// Playback constants
export const PLAYBACK = {
  MIN_RATE: 0.25,
  MAX_RATE: 4,
  DEFAULT_RATE: 1,
  FRAME_STEP: 1 / 30, // 30fps
} as const;

// UI constants
export const UI = {
  HANDLE_SIZE: 8,
  TRIM_HANDLE_WIDTH: 6,
  MIN_CLIP_WIDTH: 20, // pixels
  THUMBNAIL_HEIGHT: 40,
} as const;

// Supported formats
export const SUPPORTED_VIDEO_FORMATS = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
] as const;

export const SUPPORTED_IMAGE_FORMATS = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export const SUPPORTED_AUDIO_FORMATS = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
] as const;

// Default canvas sizes
export const CANVAS_PRESETS = [
  { name: "1080p", width: 1920, height: 1080 },
  { name: "720p", width: 1280, height: 720 },
  { name: "4K", width: 3840, height: 2160 },
  { name: "Square", width: 1080, height: 1080 },
  { name: "Portrait", width: 1080, height: 1920 },
] as const;

// Frame rate presets
export const FRAME_RATE_PRESETS = [24, 25, 30, 50, 60] as const;
