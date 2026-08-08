import { AudioClip, Clip, VideoClip, VideoTrack } from "../types";
import { findClipAtTime } from "./timelineModel";

const PLAYBACK_BOUNDARY_EPSILON = 1e-6;

export type PlaybackTrackClipIndex = Map<string, Clip[]>;

function compareClipsByStartTime(left: Clip, right: Clip): number {
  if (left.startTime !== right.startTime) {
    return left.startTime - right.startTime;
  }
  if (left.duration !== right.duration) {
    return left.duration - right.duration;
  }
  return left.id.localeCompare(right.id);
}

function findFirstClipAfterTime(trackClips: Clip[], time: number): Clip | null {
  let low = 0;
  let high = trackClips.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (trackClips[mid].startTime > time + PLAYBACK_BOUNDARY_EPSILON) {
      result = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return result >= 0 ? trackClips[result] ?? null : null;
}

export function buildPlaybackTrackClipIndex(clips: Clip[]): PlaybackTrackClipIndex {
  const clipsByTrack: PlaybackTrackClipIndex = new Map();

  for (const clip of clips) {
    const existing = clipsByTrack.get(clip.trackId);
    if (existing) {
      existing.push(clip);
    } else {
      clipsByTrack.set(clip.trackId, [clip]);
    }
  }

  for (const trackClips of clipsByTrack.values()) {
    trackClips.sort(compareClipsByStartTime);
  }

  return clipsByTrack;
}

export function isAudibleMediaClip(clip: Clip): boolean {
  if (clip.type === "video") {
    return (clip.hasAudio ?? true)
      && !(clip.audioMuted ?? false)
      && (typeof clip.audioVolume === "number" ? clip.audioVolume : 100) > 0;
  }

  if (clip.type === "audio") {
    return !(clip.audioMuted ?? false)
      && (typeof clip.audioVolume === "number" ? clip.audioVolume : 100) > 0;
  }

  return false;
}

export interface PlaybackMediaSnapshot {
  activeVideoClips: VideoClip[];
  activeAudioClips: AudioClip[];
  nextBoundaryTime: number | null;
}

export function resolvePlaybackMediaSnapshot(params: {
  tracks: VideoTrack[];
  clipsByTrack: PlaybackTrackClipIndex;
  time: number;
}): PlaybackMediaSnapshot {
  const { tracks, clipsByTrack, time } = params;
  const activeVideoClips: VideoClip[] = [];
  const activeAudioClips: AudioClip[] = [];
  let nextBoundaryTime: number | null = null;

  for (const track of tracks) {
    if (!track.visible) continue;
    const trackClips = clipsByTrack.get(track.id);
    if (!trackClips || trackClips.length === 0) continue;

    const activeClip = findClipAtTime(trackClips, time);
    if (activeClip?.visible) {
      if (activeClip.type === "video") {
        activeVideoClips.push(activeClip);
      } else if (activeClip.type === "audio") {
        activeAudioClips.push(activeClip);
      }

      const clipEnd = activeClip.startTime + activeClip.duration;
      if (
        clipEnd > time + PLAYBACK_BOUNDARY_EPSILON
        && (nextBoundaryTime === null || clipEnd < nextBoundaryTime)
      ) {
        nextBoundaryTime = clipEnd;
      }
    }

    const nextClip = findFirstClipAfterTime(trackClips, time);
    if (
      nextClip
      && (nextBoundaryTime === null || nextClip.startTime < nextBoundaryTime)
    ) {
      nextBoundaryTime = nextClip.startTime;
    }
  }

  return {
    activeVideoClips,
    activeAudioClips,
    nextBoundaryTime,
  };
}

/**
 * Audible clips that START within `(time, time + lookAhead]`.
 *
 * The active-clip resolver above can only report a clip once `time` is already
 * inside it, so a scheduler built on it necessarily discovers every clip LATE and
 * has to start it mid-way. That is inaudible on a long pad and fatal on a short
 * one-shot: the clipped part is the attack. This resolver is the other half —
 * clips near enough to arm on the audio clock before they are due.
 *
 * Clips already playing at `time` are excluded: they are the active resolver's job.
 */
export function resolveUpcomingAudioClips(params: {
  tracks: VideoTrack[];
  clipsByTrack: PlaybackTrackClipIndex;
  time: number;
  lookAhead: number;
}): Clip[] {
  const { tracks, clipsByTrack, time, lookAhead } = params;
  if (!(lookAhead > 0)) return [];

  const windowEnd = time + lookAhead;
  const upcoming: Clip[] = [];

  for (const track of tracks) {
    if (!track.visible) continue;
    const trackClips = clipsByTrack.get(track.id);
    if (!trackClips || trackClips.length === 0) continue;

    for (const clip of trackClips) {
      if (clip.startTime <= time + PLAYBACK_BOUNDARY_EPSILON) continue;
      if (clip.startTime > windowEnd + PLAYBACK_BOUNDARY_EPSILON) break;
      if (!clip.visible) continue;
      if (!isAudibleMediaClip(clip)) continue;
      upcoming.push(clip);
    }
  }

  upcoming.sort(compareClipsByStartTime);
  return upcoming;
}

export interface LookaheadStart {
  /** Absolute AudioContext time to pass to `sourceNode.start(when, ...)`. */
  when: number;
  /** Seconds from now until the clip is due; negative means it is already late. */
  leadTime: number;
  /** False when the clip's start has already passed, so it needs a mid-clip start. */
  isFuture: boolean;
}

/**
 * Translate a timeline start time into an AudioContext start time.
 *
 * Timeline seconds advance at `rate`, AudioContext seconds do not, so the wall
 * distance to the clip is the timeline distance divided by the rate. Handing that
 * to `start(when)` moves the firing decision onto the audio thread, which is why
 * main-thread jitter stops mattering.
 */
export function resolveLookaheadStart(params: {
  clipStartTime: number;
  currentTime: number;
  rate: number;
  contextTime: number;
}): LookaheadStart {
  const { clipStartTime, currentTime, contextTime } = params;
  const safeRate = Math.max(0.01, params.rate);
  const leadTime = (clipStartTime - currentTime) / safeRate;
  return {
    when: contextTime + Math.max(0, leadTime),
    leadTime,
    isFuture: leadTime > 0,
  };
}

export function collectPlaybackWindowClipIds(params: {
  tracks: VideoTrack[];
  clipsByTrack: PlaybackTrackClipIndex;
  time: number;
  lookBehind?: number;
  lookAhead?: number;
}): Set<string> {
  const {
    tracks,
    clipsByTrack,
    time,
    lookBehind = 0.5,
    lookAhead = 1.5,
  } = params;
  const windowStart = Math.max(0, time - lookBehind);
  const windowEnd = time + lookAhead;
  const clipIds = new Set<string>();

  for (const track of tracks) {
    if (!track.visible) continue;
    const trackClips = clipsByTrack.get(track.id);
    if (!trackClips || trackClips.length === 0) continue;

    for (const clip of trackClips) {
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd < windowStart - PLAYBACK_BOUNDARY_EPSILON) continue;
      if (clip.startTime > windowEnd + PLAYBACK_BOUNDARY_EPSILON) break;
      if (clip.visible) {
        clipIds.add(clip.id);
      }
    }
  }

  return clipIds;
}
