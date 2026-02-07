// ============================================
// Guide Types
// ============================================

import type { SnapOrientation } from "./snap";

/**
 * Guide orientation (same as snap orientation for consistency)
 */
export type GuideOrientation = SnapOrientation;

/**
 * A single guide line
 */
export interface Guide {
  id: string;
  orientation: GuideOrientation;
  position: number; // in image coordinates (pixels)
}

/**
 * State for guide dragging interactions
 */
export interface GuideDragState {
  isActive: boolean;
  guideId: string | null;
  isCreating: boolean; // true when dragging from ruler to create new guide
  orientation: GuideOrientation | null;
  startPosition: number;
  currentPosition: number;
}

/**
 * Initial guide drag state
 */
export const INITIAL_GUIDE_DRAG_STATE: GuideDragState = {
  isActive: false,
  guideId: null,
  isCreating: false,
  orientation: null,
  startPosition: 0,
  currentPosition: 0,
};
