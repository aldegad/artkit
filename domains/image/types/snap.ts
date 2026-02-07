// ============================================
// Snap System Types
// ============================================

/**
 * Types of sources that can be snapped to
 */
export type SnapSourceType = "guide" | "canvas-edge" | "layer-edge" | "grid";

/**
 * Orientation for snap sources and guides
 */
export type SnapOrientation = "horizontal" | "vertical";

/**
 * A snap source represents something that can be snapped to
 */
export interface SnapSource {
  type: SnapSourceType;
  orientation: SnapOrientation;
  position: number; // in image coordinates
  id?: string; // optional identifier (e.g., guide id)
}

/**
 * Result of a snap operation
 */
export interface SnapResult {
  snapped: boolean;
  position: number; // the snapped position
  source: SnapSource | null; // what it snapped to
  delta: number; // distance moved to snap
}

/**
 * Configuration for snap behavior
 */
export interface SnapConfig {
  enabled: boolean;
  tolerance: number; // snap distance in pixels (default: 5)
  sources: SnapSourceType[]; // which source types to snap to
}

/**
 * Default snap configuration
 */
export const DEFAULT_SNAP_CONFIG: SnapConfig = {
  enabled: true,
  tolerance: 5,
  sources: ["guide", "canvas-edge"],
};

/**
 * Edge types for bounds snapping
 */
export type SnapEdge = "left" | "right" | "top" | "bottom" | "centerX" | "centerY";
