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
