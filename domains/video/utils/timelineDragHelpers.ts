import { Clip } from "../types";
import { DragState } from "./timelineDragState";

export interface AutoScrollConfig {
  edgePx: number;
  maxStepPx: number;
}

interface ClipStartUpdate {
  id: string;
  startTime: number;
}

export interface SingleClipSwapResult {
  updates: ClipStartUpdate[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function isAutoScrollDragType(type: DragState["type"]): boolean {
  return type === "clip-move" || type === "clip-trim-start" || type === "clip-trim-end";
}

export function buildClipsByTrackIndex(clips: Clip[], order: "asc" | "desc"): Map<string, Clip[]> {
  const index = new Map<string, Clip[]>();
  for (const clip of clips) {
    const list = index.get(clip.trackId);
    if (list) {
      list.push(clip);
    } else {
      index.set(clip.trackId, [clip]);
    }
  }

  const direction = order === "asc" ? 1 : -1;
  for (const list of index.values()) {
    list.sort((a, b) => (a.startTime - b.startTime) * direction);
  }

  return index;
}

export function getDragAutoScrollDeltaPixels(
  x: number,
  width: number,
  config: AutoScrollConfig
): number {
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return 0;

  if (x < config.edgePx) {
    const ratio = clamp01((config.edgePx - x) / config.edgePx);
    return -Math.ceil(config.maxStepPx * ratio * ratio);
  }

  if (x > width - config.edgePx) {
    const ratio = clamp01((x - (width - config.edgePx)) / config.edgePx);
    return Math.ceil(config.maxStepPx * ratio * ratio);
  }

  return 0;
}

export function resolveSingleClipTrackSwap(options: {
  drag: DragState;
  deltaTime: number;
  pointerTrackId: string | null;
  clipsById: Map<string, Clip>;
  clipsByTrackAsc: Map<string, Clip[]>;
  triggerRatio: number;
}): SingleClipSwapResult | null {
  const { drag, deltaTime, pointerTrackId, clipsById, clipsByTrackAsc, triggerRatio } = options;
  if (!drag.clipId) return null;
  if (drag.items.length !== 1 || drag.items[0]?.type !== "clip") return null;

  const primaryClip = clipsById.get(drag.clipId) || null;
  if (!primaryClip) return null;

  // Only sort when dragging in the same track.
  if (pointerTrackId && pointerTrackId !== primaryClip.trackId) return null;

  const trackClips = clipsByTrackAsc.get(primaryClip.trackId) || [];
  if (trackClips.length < 2) return null;

  const primaryIndex = trackClips.findIndex((clip) => clip.id === primaryClip.id);
  if (primaryIndex < 0) return null;

  const pointerTime = drag.startTime + deltaTime;
  const pointerOffsetFromClipStart = drag.startTime - drag.originalClipStart;
  const candidateStart = Math.max(0, pointerTime - pointerOffsetFromClipStart);
  const candidateEnd = candidateStart + primaryClip.duration;

  if (candidateStart > primaryClip.startTime) {
    const nextClip = trackClips[primaryIndex + 1];
    if (!nextClip) return null;

    const forwardThreshold = nextClip.startTime + (nextClip.duration * triggerRatio);
    if (candidateEnd < forwardThreshold) return null;

    const gap = Math.max(0, nextClip.startTime - (primaryClip.startTime + primaryClip.duration));
    const nextStart = primaryClip.startTime;
    const primaryStart = nextStart + nextClip.duration + gap;

    return {
      updates: [
        { id: nextClip.id, startTime: nextStart },
        { id: primaryClip.id, startTime: primaryStart },
      ],
    };
  }

  if (candidateStart < primaryClip.startTime) {
    const previousClip = trackClips[primaryIndex - 1];
    if (!previousClip) return null;

    const backwardThreshold = previousClip.startTime + (previousClip.duration * triggerRatio);
    if (candidateStart > backwardThreshold) return null;

    const gap = Math.max(0, primaryClip.startTime - (previousClip.startTime + previousClip.duration));
    const primaryStart = previousClip.startTime;
    const previousStart = primaryStart + primaryClip.duration + gap;

    return {
      updates: [
        { id: primaryClip.id, startTime: primaryStart },
        { id: previousClip.id, startTime: previousStart },
      ],
    };
  }

  return null;
}
