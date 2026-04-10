"use client";

import { MutableRefObject, useEffect } from "react";
import { usePlaybackTick } from "../../hooks";
import { hasPreviewPlaybackDiscontinuity } from "./previewPlaybackDiscontinuity";

interface PlaybackPerfStats {
  windowStartMs: number;
  lastTickMs: number;
  lastRenderMs: number;
  renderedFrames: number;
  skippedByCap: number;
  longTickCount: number;
  cacheFrames: number;
  liveFrames: number;
}

interface UsePreviewPlaybackRenderTickOptions {
  playbackIsPlaying: boolean;
  playbackRate: number;
  playbackRenderFpsCap: number;
  playbackPerfRef: MutableRefObject<PlaybackPerfStats>;
  lastPlaybackTickTimeRef: MutableRefObject<number | null>;
  syncMediaRef: MutableRefObject<((request?: { forceVideoCurrentTimeSync?: boolean }) => void) | null>;
  renderRef: MutableRefObject<() => void>;
  maybeReportPlaybackStats: (now: number) => void;
  resetPlaybackPerfStats: () => void;
}

export function usePreviewPlaybackRenderTick(options: UsePreviewPlaybackRenderTickOptions) {
  const {
    playbackIsPlaying,
    playbackRate,
    playbackRenderFpsCap,
    playbackPerfRef,
    lastPlaybackTickTimeRef,
    syncMediaRef,
    renderRef,
    maybeReportPlaybackStats,
    resetPlaybackPerfStats,
  } = options;

  // Render on playback tick (driven by RAF, not React state) — no re-renders.
  usePlaybackTick((tickTime) => {
    const now = performance.now();
    const stats = playbackPerfRef.current;
    const previousTickTime = lastPlaybackTickTimeRef.current;
    const previousTickWallTime = stats.lastTickMs > 0 ? stats.lastTickMs : null;
    lastPlaybackTickTimeRef.current = tickTime;

    if (
      playbackIsPlaying &&
      hasPreviewPlaybackDiscontinuity({
        previousTimelineTime: previousTickTime,
        previousWallTimeMs: previousTickWallTime,
        nextTimelineTime: tickTime,
        nextWallTimeMs: now,
        playbackRate,
      })
    ) {
      syncMediaRef.current?.({ forceVideoCurrentTimeSync: true });
    }

    if (stats.lastTickMs > 0) {
      const tickDelta = now - stats.lastTickMs;
      const idealFrameMs = 1000 / Math.max(1, playbackRenderFpsCap);
      if (tickDelta > idealFrameMs * 1.75) {
        stats.longTickCount += 1;
      }
    }
    stats.lastTickMs = now;

    const minRenderIntervalMs = 1000 / Math.max(1, playbackRenderFpsCap);
    if (playbackIsPlaying && now - stats.lastRenderMs < minRenderIntervalMs) {
      stats.skippedByCap += 1;
      maybeReportPlaybackStats(now);
      return;
    }

    stats.lastRenderMs = now;
    stats.renderedFrames += 1;
    renderRef.current();
    maybeReportPlaybackStats(now);
  });

  useEffect(() => {
    if (playbackIsPlaying) return;
    resetPlaybackPerfStats();
  }, [playbackIsPlaying, resetPlaybackPerfStats]);
}
