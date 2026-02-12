import type { Clip } from "../types";
import { TIMELINE } from "../constants";
import { sliceClipPositionKeyframes } from "./clipTransformKeyframes";

export interface SnapToPointsOptions {
  scope?: "all" | "track";
  trackId?: string;
  excludeClipIds?: Set<string>;
}

interface BuildRazorSplitClipsOptions {
  clip: Clip;
  splitCursorTime: number;
  snapToPoints: (time: number, options?: SnapToPointsOptions) => number;
  generateId?: () => string;
}

interface RazorSplitResult {
  firstClip: Clip;
  secondClip: Clip;
}

export function buildRazorSplitClips({
  clip,
  splitCursorTime,
  snapToPoints,
  generateId = () => crypto.randomUUID(),
}: BuildRazorSplitClipsOptions): RazorSplitResult | null {
  const rawSplitTime = Math.max(clip.startTime, Math.min(splitCursorTime, clip.startTime + clip.duration));
  const snappedSplitTime = snapToPoints(rawSplitTime, {
    excludeClipIds: new Set([clip.id]),
  });
  const splitTime = Math.max(
    clip.startTime,
    Math.min(snappedSplitTime, clip.startTime + clip.duration),
  );
  const splitOffset = splitTime - clip.startTime;

  if (
    splitOffset <= TIMELINE.CLIP_MIN_DURATION
    || clip.duration - splitOffset <= TIMELINE.CLIP_MIN_DURATION
  ) {
    return null;
  }

  const firstDuration = splitOffset;
  const secondDuration = clip.duration - splitOffset;
  const firstTransformKeyframes = sliceClipPositionKeyframes(
    clip,
    0,
    firstDuration,
    { includeStart: true, includeEnd: true },
  );
  const secondTransformKeyframes = sliceClipPositionKeyframes(
    clip,
    splitOffset,
    secondDuration,
    { includeStart: true, includeEnd: false },
  );
  const firstPosition = firstTransformKeyframes?.position?.[0]?.value || clip.position;
  const secondPosition = secondTransformKeyframes?.position?.[0]?.value || clip.position;

  const firstClip: Clip = {
    ...clip,
    id: generateId(),
    duration: firstDuration,
    trimOut: clip.trimIn + firstDuration,
    sourceSize: { ...clip.sourceSize },
    position: { ...firstPosition },
    transformKeyframes: firstTransformKeyframes,
  };

  const secondClip: Clip = {
    ...clip,
    id: generateId(),
    name: `${clip.name} (2)`,
    startTime: splitTime,
    duration: secondDuration,
    trimIn: clip.trimIn + splitOffset,
    sourceSize: { ...clip.sourceSize },
    position: { ...secondPosition },
    transformKeyframes: secondTransformKeyframes,
  };

  return { firstClip, secondClip };
}
