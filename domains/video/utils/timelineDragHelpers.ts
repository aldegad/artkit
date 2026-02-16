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

export interface SnapTimeResolverOptions {
  scope?: "all" | "track";
  trackId?: string;
  excludeClipIds?: Set<string>;
}

export interface SnapTimelineTimeToClipPointsOptions extends SnapTimeResolverOptions {
  snapEnabled: boolean;
  zoom: number;
  snapThresholdPx: number;
  clips: Clip[];
}

export type SnapTimeResolver = (
  time: number,
  options?: SnapTimeResolverOptions
) => number;

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

export function snapTimelineTimeToClipPoints(
  time: number,
  options: SnapTimelineTimeToClipPointsOptions
): number {
  if (!options.snapEnabled) return time;

  const threshold = options.snapThresholdPx / Math.max(0.001, options.zoom);
  const points: number[] = [0];
  const scope = options.scope ?? "all";
  const trackId = options.trackId;
  const excludeClipIds = options.excludeClipIds || new Set<string>();

  for (const clip of options.clips) {
    if (scope === "track" && trackId && clip.trackId !== trackId) continue;
    if (excludeClipIds.has(clip.id)) continue;
    points.push(clip.startTime);
    points.push(clip.startTime + clip.duration);
  }

  for (const point of points) {
    if (Math.abs(time - point) < threshold) {
      return point;
    }
  }

  return time;
}

export function calculateSnappedClipMoveTimeDelta(options: {
  drag: Pick<DragState, "originalClipStart" | "originalClipDuration">;
  deltaTime: number;
  movingClipIds: Set<string>;
  snapTime: SnapTimeResolver;
}): number {
  const rawStart = Math.max(0, options.drag.originalClipStart + options.deltaTime);
  const snappedStart = options.snapTime(rawStart, {
    excludeClipIds: options.movingClipIds,
  });

  // Also snap end edge: if end snaps, adjust start accordingly.
  const rawEnd = rawStart + options.drag.originalClipDuration;
  const snappedEnd = options.snapTime(rawEnd, {
    excludeClipIds: options.movingClipIds,
  });
  const endAdjusted = Math.max(0, snappedEnd - options.drag.originalClipDuration);

  // Use whichever snap is closer.
  const startDelta = Math.abs(snappedStart - rawStart);
  const endDelta = Math.abs(snappedEnd - rawEnd);
  const finalStart = startDelta <= endDelta ? snappedStart : endAdjusted;

  // Time delta from primary clip's original position.
  return finalStart - options.drag.originalClipStart;
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
