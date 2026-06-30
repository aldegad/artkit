"use client";

import { useMemo } from "react";
import type { Clip, PlaybackState } from "@/domains/video";

interface PlaybackRangeState {
  loop: boolean;
  loopStart: number;
  loopEnd: number;
}

interface UseVideoPlaybackRangeOptions {
  clips: Clip[];
  projectDuration: number;
  playback: PlaybackState;
}

export function useVideoPlaybackRange(options: UseVideoPlaybackRangeOptions): PlaybackRangeState | undefined {
  const { clips, projectDuration, playback } = options;

  return useMemo(() => {
    const durationFromClips = clips.reduce(
      (max, clip) => Math.max(max, clip.startTime + clip.duration),
      0
    );
    const duration = Math.max(durationFromClips, projectDuration, 0.001);
    const loopStart = Math.max(0, Math.min(playback.loopStart, duration));
    const hasRange = playback.loopEnd > loopStart + 0.001;
    const loopEnd = hasRange
      ? Math.max(loopStart + 0.001, Math.min(playback.loopEnd, duration))
      : duration;
    const hasCustomRange = hasRange && (loopStart > 0.001 || loopEnd < duration - 0.001);

    // Don't persist when range is effectively cleared (full range + loop off).
    if (!playback.loop && !hasCustomRange) return undefined;

    return {
      loop: playback.loop,
      loopStart,
      loopEnd,
    };
  }, [clips, projectDuration, playback.loop, playback.loopStart, playback.loopEnd]);
}
