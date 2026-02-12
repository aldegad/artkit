"use client";

import { PRE_RENDER } from "../../constants";
import { Clip, VideoTrack } from "../../types";

const SAMPLE_FRAME_EPSILON = 1e-6;

export function getLoopFrameBounds(
  loop: boolean,
  loopStart: number,
  loopEnd: number,
  duration: number
): { minFrame: number; maxFrame: number } | null {
  if (!loop) return null;

  const safeDuration = Math.max(0, duration);
  const rangeStart = Math.max(0, Math.min(loopStart, safeDuration));
  const hasRange = loopEnd > rangeStart + 0.001;
  const rangeEnd = hasRange
    ? Math.max(rangeStart + 0.001, Math.min(loopEnd, safeDuration))
    : safeDuration;

  // Keep sampled frames inside [loopStart, loopEnd) to avoid one-frame flashes
  // from just before IN when loop points are not aligned to frame boundaries.
  const minFrame = Math.max(0, Math.ceil(rangeStart * PRE_RENDER.FRAME_RATE - SAMPLE_FRAME_EPSILON));
  const exclusiveEndFrame = Math.max(
    minFrame + 1,
    Math.ceil(rangeEnd * PRE_RENDER.FRAME_RATE - SAMPLE_FRAME_EPSILON)
  );

  return { minFrame, maxFrame: exclusiveEndFrame - 1 };
}

export interface PlaybackPerfStats {
  windowStartMs: number;
  lastTickMs: number;
  lastRenderMs: number;
  renderedFrames: number;
  skippedByCap: number;
  longTickCount: number;
  cacheFrames: number;
  liveFrames: number;
}

export function createPlaybackPerfStats(): PlaybackPerfStats {
  return {
    windowStartMs: 0,
    lastTickMs: 0,
    lastRenderMs: 0,
    renderedFrames: 0,
    skippedByCap: 0,
    longTickCount: 0,
    cacheFrames: 0,
    liveFrames: 0,
  };
}

export function resetPlaybackPerfStatsWindow(stats: PlaybackPerfStats) {
  stats.renderedFrames = 0;
  stats.skippedByCap = 0;
  stats.longTickCount = 0;
  stats.cacheFrames = 0;
  stats.liveFrames = 0;
}

export function countActiveVisualLayersAtTime(
  tracks: VideoTrack[],
  getClipAtTime: (trackId: string, time: number) => Clip | null,
  time: number,
): number {
  let activeVisualLayers = 0;
  for (const track of tracks) {
    if (!track.visible) continue;
    const clip = getClipAtTime(track.id, time);
    if (!clip || !clip.visible || clip.type === "audio") continue;
    activeVisualLayers += 1;
  }
  return activeVisualLayers;
}
