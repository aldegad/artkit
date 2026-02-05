/**
 * Timeline view state
 */
export interface TimelineViewState {
  zoom: number; // Pixels per second
  scrollX: number; // Horizontal scroll position (seconds)
  scrollY: number; // Vertical scroll position (pixels)
  snapEnabled: boolean;
  snapToFrames: boolean;
  snapToClips: boolean;
}

/**
 * Timeline drag state types
 */
export type TimelineDragType =
  | "none"
  | "playhead"
  | "clip-move"
  | "clip-trim-start"
  | "clip-trim-end"
  | "track-resize"
  | "selection";

export interface TimelineDragState {
  type: TimelineDragType;
  startX: number;
  startY: number;
  clipId?: string;
  trackId?: string;
  originalStartTime?: number;
  originalDuration?: number;
}

/**
 * Initial timeline view state
 */
export const INITIAL_TIMELINE_VIEW: TimelineViewState = {
  zoom: 100, // 100 pixels per second
  scrollX: 0,
  scrollY: 0,
  snapEnabled: true,
  snapToFrames: false,
  snapToClips: true,
};

/**
 * Timeline selection state
 */
export interface TimelineSelection {
  clipIds: string[];
  trackId: string | null;
  timeRange: { start: number; end: number } | null;
}

export const INITIAL_TIMELINE_SELECTION: TimelineSelection = {
  clipIds: [],
  trackId: null,
  timeRange: null,
};
