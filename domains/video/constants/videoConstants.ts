/**
 * Video editor constants
 */

// Timeline constants
export const TIMELINE = {
  MIN_ZOOM: 10, // pixels per second
  MAX_ZOOM: 500,
  DEFAULT_ZOOM: 100,
  WHEEL_ZOOM_FACTOR: 0.1, // 10% per wheel tick
  TRACK_MIN_HEIGHT: 40,
  TRACK_DEFAULT_HEIGHT: 60,
  TRACK_MAX_HEIGHT: 120,
  RULER_HEIGHT: 16,
  PLAYHEAD_WIDTH: 2,
  SNAP_THRESHOLD: 5, // pixels
  CLIP_MIN_DURATION: 0.1, // seconds
  TOOLBAR_COMPACT_BREAKPOINT: 280, // px — compact mode below this width
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

// Mask lane height in timeline
export const MASK_LANE_HEIGHT = 20;

// Playback constants
export const PLAYBACK = {
  MIN_RATE: 0.25,
  MAX_RATE: 4,
  DEFAULT_RATE: 1,
  FRAME_STEP: 1 / 30, // 30fps
  SYNC_INTERVAL_MS: 100, // media sync interval during playback
  SEEK_DRIFT_THRESHOLD: 0.15, // seconds: visual media re-seek threshold
  AUDIO_SEEK_DRIFT_THRESHOLD: 0.35, // seconds: fallback HTMLAudio seek threshold
  TIME_DISPLAY_THROTTLE_MS: 100, // throttle for time display updates
} as const;

// UI constants
export const UI = {
  HANDLE_SIZE: 8,
  TRIM_HANDLE_WIDTH: 6,
  MIN_CLIP_WIDTH: 20, // pixels
  THUMBNAIL_HEIGHT: 40,
} as const;

// Pointer gesture policy constants
export const GESTURE = {
  LONG_PRESS_MS: 400,
  TOUCH_GESTURE_THRESHOLD_PX: 8,
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

// Pre-render cache constants
export const PRE_RENDER = {
  FRAME_RATE: 30, // frames per second for cache granularity
  MAX_FRAMES: 600, // max cached frames (~20s at 30fps)
  CACHE_RESOLUTION_SCALE: 1, // render at project resolution
  BATCH_DELAY_MS: 0, // setTimeout delay between frames (yield to UI)
  SEEK_TIMEOUT_MS: 2000, // max wait for video seek
} as const;

// Web Audio playback constants
export const WEB_AUDIO = {
  SCHEDULER_INTERVAL_MS: 50, // clip boundary check interval during playback
  SEEK_JUMP_THRESHOLD: 0.3, // seconds: time jump larger than this = seek event
  SEEK_DRIFT_TOLERANCE: 0.18, // seconds: expected-vs-actual timeline drift treated as seek
  BACKWARD_JUMP_EPSILON: 0.05, // seconds: any notable backward jump indicates seek/loop wrap
  RESCHEDULE_MIN_INTERVAL_MS: 120, // debounce reschedule to avoid stop/start crackle bursts
} as const;

// Frame rate presets
export const FRAME_RATE_PRESETS = [24, 25, 30, 50, 60] as const;
