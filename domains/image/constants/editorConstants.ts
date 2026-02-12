/**
 * Editor UI Constants
 *
 * Centralized constants for canvas rendering, interaction, and layout.
 * Eliminates magic numbers scattered across hooks and components.
 */

// ============================================
// Canvas Rendering
// ============================================

/** Checkerboard pattern settings for transparency indication */
export const CHECKERBOARD = {
  /** Default checkerboard size for canvas background */
  SIZE_DEFAULT: 8,
  /** Larger checkerboard size for crop expand preview */
  SIZE_EXPAND: 10,
} as const;

// ============================================
// Transform & Crop Handles
// ============================================

/** Handle sizes for transform and crop operations */
export const HANDLE_SIZE = {
  /** Default size for corner/edge handles */
  DEFAULT: 10,
  /** Hit area for handle detection (can be larger than visual) */
  HIT_AREA: 10,
} as const;

/** Rotate handle configuration */
export const ROTATE_HANDLE = {
  /** Visual radius of the rotate handle circle */
  RADIUS: 10,
  /** Hit area radius for rotate handle detection */
  HIT_AREA: 16,
  /** Distance from transform box top to rotate handle center */
  OFFSET: 36,
} as const;

// ============================================
// Interaction Thresholds
// ============================================

/** Interaction thresholds and minimum sizes */
export const INTERACTION = {
  /** Brush crosshair offset from center */
  CROSSHAIR_OFFSET: 5,
  /** Minimum crop area size */
  MIN_CROP_SIZE: 10,
  /** Minimum selection size to be valid */
  MIN_SELECTION_SIZE: 5,
  /** Minimum resize dimension */
  MIN_RESIZE_SIZE: 20,
  /** Guide hover tolerance in image pixels (will be divided by zoom) */
  GUIDE_TOLERANCE: 5,
} as const;

// ============================================
// Viewport
// ============================================

/** Shared zoom/pan constants used across image editor interactions */
export const VIEWPORT = {
  /** Hard zoom bounds */
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 10,
  /** Wheel/pinch-ish zoom intensity used by canvas viewport */
  WHEEL_ZOOM_FACTOR: 0.1,
  /** Default fit-to-screen padding around canvas */
  FIT_PADDING: 27,
  /** Discrete zoom tool / keyboard multipliers */
  ZOOM_STEP_IN: 1.25,
  ZOOM_STEP_OUT: 0.8,
} as const;

// ============================================
// Floating Window Layout
// ============================================

/** Floating window dimensions and constraints */
export const FLOATING_WINDOW = {
  /** Title bar height */
  TITLE_BAR_HEIGHT: 40,
  /** Minimum window width */
  MIN_WIDTH: 200,
  /** Minimum window height */
  MIN_HEIGHT: 150,
  /** Edge snap threshold in pixels */
  EDGE_SNAP_THRESHOLD: 30,
} as const;

// ============================================
// Colors (Default Values)
// ============================================

/** Default color values */
export const DEFAULT_COLORS = {
  /** Default brush color */
  BRUSH: "#000000",
} as const;

/** Global event name dispatched when layer canvas pixels change */
export const LAYER_CANVAS_UPDATED_EVENT = "image-editor:layer-canvas-updated" as const;
