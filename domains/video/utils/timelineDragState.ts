import type { TimelineDragType } from "../types";

export interface DragItem {
  type: "clip" | "mask";
  id: string;
  originalStartTime: number;
}

export interface DragState {
  type: TimelineDragType;
  clipId: string | null;
  items: DragItem[];
  startX: number;
  startY: number;
  startTime: number;
  originalClipStart: number;
  originalClipDuration: number;
  originalTrimIn: number;
}

interface CommonDragStateFields {
  x: number;
  contentY: number;
  time: number;
}

interface ClipMoveDragStateFields extends CommonDragStateFields {
  clipId: string;
  items: DragItem[];
  clipStart: number;
  clipDuration: number;
  clipTrimIn: number;
}

interface TrimDragStateFields extends CommonDragStateFields {
  clipId: string;
  handle: "start" | "end";
  clipStart: number;
  clipDuration: number;
  clipTrimIn: number;
}

export const INITIAL_TIMELINE_DRAG_STATE: DragState = {
  type: "none",
  clipId: null,
  items: [],
  startX: 0,
  startY: 0,
  startTime: 0,
  originalClipStart: 0,
  originalClipDuration: 0,
  originalTrimIn: 0,
};

export function createClipMoveDragState(fields: ClipMoveDragStateFields): DragState {
  return {
    type: "clip-move",
    clipId: fields.clipId,
    items: fields.items,
    startX: fields.x,
    startY: fields.contentY,
    startTime: fields.time,
    originalClipStart: fields.clipStart,
    originalClipDuration: fields.clipDuration,
    originalTrimIn: fields.clipTrimIn,
  };
}

export function createTrimDragState(fields: TrimDragStateFields): DragState {
  return {
    type: fields.handle === "start" ? "clip-trim-start" : "clip-trim-end",
    clipId: fields.clipId,
    items: [],
    startX: fields.x,
    startY: fields.contentY,
    startTime: fields.time,
    originalClipStart: fields.clipStart,
    originalClipDuration: fields.clipDuration,
    originalTrimIn: fields.clipTrimIn,
  };
}

export function createPlayheadDragState(fields: CommonDragStateFields): DragState {
  return {
    type: "playhead",
    clipId: null,
    items: [],
    startX: fields.x,
    startY: fields.contentY,
    startTime: fields.time,
    originalClipStart: 0,
    originalClipDuration: 0,
    originalTrimIn: 0,
  };
}
