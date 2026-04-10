import { Clip } from "../types";
import {
  getTimelineFrameRange,
  normalizeTimelineFrameRate,
  timelineFrameIndexToTime,
} from "./timelineFrame";

const TIMELINE_EDIT_EPSILON = 1e-6;

export function canTrimClipStartAtTime(
  clip: Pick<Clip, "startTime" | "duration">,
  timelineTime: number,
  minDuration: number
): boolean {
  if (!Number.isFinite(timelineTime)) return false;
  const clipStart = Number.isFinite(clip.startTime) ? clip.startTime : 0;
  const clipDuration = Number.isFinite(clip.duration) ? clip.duration : 0;
  const clipEnd = clipStart + clipDuration;
  return timelineTime > clipStart + minDuration && timelineTime < clipEnd - TIMELINE_EDIT_EPSILON;
}

export function canTrimClipEndAtTime(
  clip: Pick<Clip, "startTime" | "duration">,
  timelineTime: number,
  minDuration: number
): boolean {
  if (!Number.isFinite(timelineTime)) return false;
  const clipStart = Number.isFinite(clip.startTime) ? clip.startTime : 0;
  const clipDuration = Number.isFinite(clip.duration) ? clip.duration : 0;
  const clipEnd = clipStart + clipDuration;
  return timelineTime > clipStart + TIMELINE_EDIT_EPSILON && timelineTime < clipEnd - minDuration;
}

export function closeTimelineTrackGaps(
  clips: Clip[],
  frameRate: number
): { clips: Clip[]; changed: boolean } {
  if (clips.length === 0) {
    return { clips, changed: false };
  }

  const safeFrameRate = normalizeTimelineFrameRate(frameRate);
  const clipsByTrack = new Map<string, Array<{ clip: Clip; index: number }>>();

  clips.forEach((clip, index) => {
    const list = clipsByTrack.get(clip.trackId);
    if (list) {
      list.push({ clip, index });
      return;
    }
    clipsByTrack.set(clip.trackId, [{ clip, index }]);
  });

  const nextClipsById = new Map<string, Clip>();
  let changed = false;

  for (const entries of clipsByTrack.values()) {
    entries.sort((left, right) => {
      if (Math.abs(left.clip.startTime - right.clip.startTime) > TIMELINE_EDIT_EPSILON) {
        return left.clip.startTime - right.clip.startTime;
      }
      return left.index - right.index;
    });

    let nextStartFrame = 0;

    for (const entry of entries) {
      const frameRange = getTimelineFrameRange(
        entry.clip.startTime,
        entry.clip.duration,
        safeFrameRate
      );
      const nextStartTime = timelineFrameIndexToTime(nextStartFrame, safeFrameRate);
      if (Math.abs(nextStartTime - entry.clip.startTime) > TIMELINE_EDIT_EPSILON) {
        changed = true;
      }
      nextClipsById.set(entry.clip.id, {
        ...entry.clip,
        startTime: nextStartTime,
      });
      nextStartFrame += frameRange.frameCount;
    }
  }

  if (!changed) {
    return { clips, changed: false };
  }

  return {
    clips: clips.map((clip) => nextClipsById.get(clip.id) ?? clip),
    changed: true,
  };
}
