import { Point } from "@/shared/types";
import { Clip, ClipTransformKeyframes, PositionKeyframe } from "../types";

export const POSITION_KEYFRAME_EPSILON = 0.0001;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeDuration(duration: number): number {
  return Math.max(0, isFiniteNumber(duration) ? duration : 0);
}

function sanitizeLocalTime(time: number, duration: number): number {
  if (!isFiniteNumber(time)) return 0;
  return Math.max(0, Math.min(time, sanitizeDuration(duration)));
}

function clonePoint(point: Point): Point {
  return {
    x: isFiniteNumber(point?.x) ? point.x : 0,
    y: isFiniteNumber(point?.y) ? point.y : 0,
  };
}

function createPositionKeyframe(time: number, value: Point, id?: string): PositionKeyframe {
  return {
    id: typeof id === "string" && id.length > 0 ? id : crypto.randomUUID(),
    time,
    value: clonePoint(value),
    interpolation: "linear",
  };
}

function buildTransformKeyframes(
  clip: Clip,
  positionKeyframes: PositionKeyframe[] | undefined
): ClipTransformKeyframes | undefined {
  const next: ClipTransformKeyframes = {
    ...(clip.transformKeyframes || {}),
  };

  if (positionKeyframes && positionKeyframes.length > 0) {
    next.position = positionKeyframes;
  } else {
    delete next.position;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function getClipLocalTime(clip: Clip, timelineTime: number): number {
  if (!isFiniteNumber(timelineTime)) return 0;
  const localTime = timelineTime - clip.startTime;
  return sanitizeLocalTime(localTime, clip.duration);
}

export function normalizePositionKeyframes(
  keyframes: PositionKeyframe[] | undefined,
  duration: number
): PositionKeyframe[] {
  if (!keyframes || keyframes.length === 0) return [];

  const safeDuration = sanitizeDuration(duration);
  const normalized = keyframes
    .filter((keyframe) => {
      return (
        keyframe &&
        isFiniteNumber(keyframe.time) &&
        keyframe.value &&
        isFiniteNumber(keyframe.value.x) &&
        isFiniteNumber(keyframe.value.y)
      );
    })
    .map((keyframe) =>
      createPositionKeyframe(
        sanitizeLocalTime(keyframe.time, safeDuration),
        keyframe.value,
        keyframe.id
      )
    )
    .sort((a, b) => a.time - b.time);

  if (normalized.length <= 1) return normalized;

  const deduped: PositionKeyframe[] = [normalized[0]];
  for (let i = 1; i < normalized.length; i += 1) {
    const current = normalized[i];
    const prev = deduped[deduped.length - 1];
    if (Math.abs(current.time - prev.time) <= POSITION_KEYFRAME_EPSILON) {
      deduped[deduped.length - 1] = createPositionKeyframe(prev.time, current.value, current.id);
    } else {
      deduped.push(current);
    }
  }

  return deduped;
}

export function normalizeClipTransformKeyframes(
  clip: Pick<Clip, "duration" | "transformKeyframes">
): ClipTransformKeyframes | undefined {
  if (!clip.transformKeyframes) return undefined;

  const position = normalizePositionKeyframes(clip.transformKeyframes.position, clip.duration);
  const next: ClipTransformKeyframes = {
    ...clip.transformKeyframes,
    position,
  };

  if (!position || position.length === 0) {
    delete next.position;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function getClipPositionKeyframes(clip: Clip): PositionKeyframe[] {
  return normalizePositionKeyframes(clip.transformKeyframes?.position, clip.duration);
}

export function resolvePositionFromKeyframes(
  keyframes: PositionKeyframe[],
  localTime: number,
  fallback: Point
): Point {
  if (keyframes.length === 0) return clonePoint(fallback);

  if (localTime <= keyframes[0].time + POSITION_KEYFRAME_EPSILON) {
    return clonePoint(keyframes[0].value);
  }

  const last = keyframes[keyframes.length - 1];
  if (localTime >= last.time - POSITION_KEYFRAME_EPSILON) {
    return clonePoint(last.value);
  }

  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const start = keyframes[i];
    const end = keyframes[i + 1];

    if (localTime < start.time - POSITION_KEYFRAME_EPSILON) {
      continue;
    }

    if (localTime <= end.time + POSITION_KEYFRAME_EPSILON) {
      const span = Math.max(POSITION_KEYFRAME_EPSILON, end.time - start.time);
      const ratio = Math.max(0, Math.min(1, (localTime - start.time) / span));
      return {
        x: start.value.x + (end.value.x - start.value.x) * ratio,
        y: start.value.y + (end.value.y - start.value.y) * ratio,
      };
    }
  }

  return clonePoint(last.value);
}

export function resolveClipPositionAtLocalTime(clip: Clip, localTime: number): Point {
  const keyframes = getClipPositionKeyframes(clip);
  const clampedLocalTime = sanitizeLocalTime(localTime, clip.duration);
  return resolvePositionFromKeyframes(keyframes, clampedLocalTime, clip.position);
}

export function resolveClipPositionAtTimelineTime(clip: Clip, timelineTime: number): Point {
  return resolveClipPositionAtLocalTime(clip, getClipLocalTime(clip, timelineTime));
}

export function findPositionKeyframeIndexAtLocalTime(
  keyframes: PositionKeyframe[],
  localTime: number,
  epsilon: number = POSITION_KEYFRAME_EPSILON
): number {
  for (let i = 0; i < keyframes.length; i += 1) {
    if (Math.abs(keyframes[i].time - localTime) <= epsilon) {
      return i;
    }
  }
  return -1;
}

export function hasClipPositionKeyframeAtTimelineTime(
  clip: Clip,
  timelineTime: number,
  epsilon: number = POSITION_KEYFRAME_EPSILON
): boolean {
  const localTime = getClipLocalTime(clip, timelineTime);
  const keyframes = getClipPositionKeyframes(clip);
  return findPositionKeyframeIndexAtLocalTime(keyframes, localTime, epsilon) >= 0;
}

export function upsertClipPositionKeyframeAtTimelineTime(
  clip: Clip,
  timelineTime: number,
  value: Point,
  options: { ensureInitialKeyframe?: boolean } = {}
): Partial<Clip> {
  const localTime = getClipLocalTime(clip, timelineTime);
  const ensureInitialKeyframe = options.ensureInitialKeyframe ?? true;
  const current = getClipPositionKeyframes(clip);
  const next = current.map((keyframe) => createPositionKeyframe(keyframe.time, keyframe.value, keyframe.id));

  if (ensureInitialKeyframe && localTime > POSITION_KEYFRAME_EPSILON) {
    const hasInitial = next.some((keyframe) => keyframe.time <= POSITION_KEYFRAME_EPSILON);
    if (!hasInitial) {
      const initialValue = resolvePositionFromKeyframes(next, 0, clip.position);
      next.push(createPositionKeyframe(0, initialValue));
    }
  }

  const idx = findPositionKeyframeIndexAtLocalTime(next, localTime);
  if (idx >= 0) {
    next[idx] = createPositionKeyframe(next[idx].time, value, next[idx].id);
  } else {
    next.push(createPositionKeyframe(localTime, value));
  }

  const normalized = normalizePositionKeyframes(next, clip.duration);
  return {
    position: normalized[0] ? clonePoint(normalized[0].value) : clonePoint(clip.position),
    transformKeyframes: buildTransformKeyframes(clip, normalized),
  };
}

export function removeClipPositionKeyframeAtTimelineTime(
  clip: Clip,
  timelineTime: number
): { removed: boolean; updates: Partial<Clip> } {
  const localTime = getClipLocalTime(clip, timelineTime);
  const current = getClipPositionKeyframes(clip);
  const idx = findPositionKeyframeIndexAtLocalTime(current, localTime);

  if (idx < 0) {
    return { removed: false, updates: {} };
  }

  const next = current.filter((_, index) => index !== idx);
  const normalized = normalizePositionKeyframes(next, clip.duration);
  const fallbackPosition = normalized.length > 0
    ? resolvePositionFromKeyframes(normalized, localTime, clip.position)
    : clonePoint(current[idx].value);

  return {
    removed: true,
    updates: {
      position: fallbackPosition,
      transformKeyframes: buildTransformKeyframes(clip, normalized.length > 0 ? normalized : undefined),
    },
  };
}

export function offsetClipPositionValues(
  clip: Clip,
  dx: number,
  dy: number
): Partial<Clip> {
  const position = {
    x: clip.position.x + dx,
    y: clip.position.y + dy,
  };

  const keyframes = getClipPositionKeyframes(clip);
  if (keyframes.length === 0) {
    return { position };
  }

  const shifted = keyframes.map((keyframe) =>
    createPositionKeyframe(
      keyframe.time,
      {
        x: keyframe.value.x + dx,
        y: keyframe.value.y + dy,
      },
      keyframe.id
    )
  );

  return {
    position,
    transformKeyframes: buildTransformKeyframes(clip, shifted),
  };
}

export function sliceClipPositionKeyframes(
  clip: Clip,
  segmentStart: number,
  segmentDuration: number,
  options: { includeStart?: boolean; includeEnd?: boolean } = {}
): ClipTransformKeyframes | undefined {
  const current = getClipPositionKeyframes(clip);
  if (current.length === 0) {
    return buildTransformKeyframes(clip, undefined);
  }

  const safeStart = sanitizeLocalTime(segmentStart, clip.duration);
  const safeDuration = sanitizeDuration(segmentDuration);
  const safeEnd = sanitizeLocalTime(safeStart + safeDuration, clip.duration);
  const includeStart = options.includeStart ?? true;
  const includeEnd = options.includeEnd ?? false;

  const next: PositionKeyframe[] = [];

  if (includeStart) {
    next.push(createPositionKeyframe(0, resolvePositionFromKeyframes(current, safeStart, clip.position)));
  }

  for (const keyframe of current) {
    if (keyframe.time <= safeStart + POSITION_KEYFRAME_EPSILON) continue;
    if (keyframe.time >= safeEnd - POSITION_KEYFRAME_EPSILON) continue;
    next.push(
      createPositionKeyframe(
        sanitizeLocalTime(keyframe.time - safeStart, safeDuration),
        keyframe.value,
        keyframe.id
      )
    );
  }

  if (includeEnd && safeDuration > POSITION_KEYFRAME_EPSILON) {
    next.push(
      createPositionKeyframe(
        safeDuration,
        resolvePositionFromKeyframes(current, safeEnd, clip.position)
      )
    );
  }

  const normalized = normalizePositionKeyframes(next, safeDuration);
  return buildTransformKeyframes(clip, normalized.length > 0 ? normalized : undefined);
}
