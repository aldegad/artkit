"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Clip,
  VideoTrack,
  getClipPlaybackSpeed,
  getSourceDurationForTimelineDuration,
  getSourceTime,
} from "../types";
import { WEB_AUDIO } from "../constants";
import {
  getAudioBuffer,
  getSharedAudioContext,
  isAudioBufferReady,
} from "./useAudioBufferCache";
import { playbackTick } from "../utils/playbackTick";
import { subscribeImmediatePlaybackStop } from "../utils/playbackStopSignal";
import {
  buildPlaybackTrackClipIndex,
  isAudibleMediaClip,
  resolvePlaybackMediaSnapshot,
} from "../utils/playbackActiveMedia";

interface ActiveAudioNode {
  clipId: string;
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
}

interface AudioDebugStats {
  startedNodes: number;
  stoppedNodes: number;
  endedNodes: number;
  bufferMisses: number;
  scheduleRuns: number;
  rescheduleCount: number;
  lastReportAt: number;
}

interface UseWebAudioPlaybackParams {
  tracks: VideoTrack[];
  clips: Clip[];
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  isPlaying: boolean;
  playbackRate: number;
  currentTimeRef: React.RefObject<number>;
  debugLogs?: boolean;
  enabled?: boolean;
}

export function useWebAudioPlayback(params: UseWebAudioPlaybackParams) {
  const {
    tracks,
    clips,
    isPlaying,
    playbackRate,
    currentTimeRef,
    debugLogs = false,
    enabled = true,
  } = params;

  const activeNodesRef = useRef<Map<string, ActiveAudioNode>>(new Map());
  const schedulerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const lastTickWallTimeRef = useRef<number>(0);
  const lastRescheduleAtRef = useRef<number>(0);
  const debugLogsRef = useRef(debugLogs);
  const isForegroundRef = useRef<boolean>(typeof document === "undefined" ? true : document.visibilityState === "visible");
  const debugStatsRef = useRef<AudioDebugStats>({
    startedNodes: 0,
    stoppedNodes: 0,
    endedNodes: 0,
    bufferMisses: 0,
    scheduleRuns: 0,
    rescheduleCount: 0,
    lastReportAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
  });
  const activeTracks = useMemo(
    () => tracks.filter((track) => track.visible && !track.muted),
    [tracks],
  );
  const clipsByTrack = useMemo(() => buildPlaybackTrackClipIndex(clips), [clips]);

  const activeTracksRef = useRef(activeTracks);
  const clipsRef = useRef(clips);
  const clipsByTrackRef = useRef(clipsByTrack);
  const playbackRateRef = useRef(playbackRate);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => { activeTracksRef.current = activeTracks; }, [activeTracks]);
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { clipsByTrackRef.current = clipsByTrack; }, [clipsByTrack]);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { debugLogsRef.current = debugLogs; }, [debugLogs]);

  const maybeReportDebugStats = useCallback(() => {
    if (!debugLogsRef.current) return;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const stats = debugStatsRef.current;
    const elapsedMs = now - stats.lastReportAt;
    if (elapsedMs < 3000) return;

    const elapsedSec = elapsedMs / 1000;
    console.info("[VideoPreviewAudio]", {
      activeNodes: activeNodesRef.current.size,
      scheduleRuns: stats.scheduleRuns,
      schedulePerSec: Number((stats.scheduleRuns / elapsedSec).toFixed(2)),
      startedNodes: stats.startedNodes,
      stoppedNodes: stats.stoppedNodes,
      endedNodes: stats.endedNodes,
      bufferMisses: stats.bufferMisses,
      reschedules: stats.rescheduleCount,
    });

    stats.startedNodes = 0;
    stats.stoppedNodes = 0;
    stats.endedNodes = 0;
    stats.bufferMisses = 0;
    stats.scheduleRuns = 0;
    stats.rescheduleCount = 0;
    stats.lastReportAt = now;
  }, []);

  const nowMs = useCallback(() => (
    typeof performance !== "undefined" ? performance.now() : Date.now()
  ), []);

  const clearScheduledAudioCheck = useCallback(() => {
    if (schedulerTimerRef.current !== null) {
      clearTimeout(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
  }, []);

  const stopAllNodes = useCallback(() => {
    clearScheduledAudioCheck();
    for (const [, node] of activeNodesRef.current) {
      node.sourceNode.onended = null;
      try {
        node.sourceNode.stop();
      } catch {
        // Already stopped.
      }
      node.sourceNode.disconnect();
      node.gainNode.disconnect();
      debugStatsRef.current.stoppedNodes += 1;
    }
    activeNodesRef.current.clear();
  }, [clearScheduledAudioCheck]);

  const forceStopImmediately = useCallback(() => {
    isPlayingRef.current = false;
    stopAllNodes();
    const ctx = getSharedAudioContext();
    if (ctx.state === "running") {
      void ctx.suspend().catch(() => {});
    }
  }, [stopAllNodes]);

  useEffect(() => {
    if (enabled) return;
    forceStopImmediately();
  }, [enabled, forceStopImmediately]);

  const scheduleAudio = useCallback(() => {
    if (!enabled) return;
    if (!isPlayingRef.current || !isForegroundRef.current) return;
    debugStatsRef.current.scheduleRuns += 1;

    const ctx = getSharedAudioContext();
    const ct = currentTimeRef.current;
    const rate = playbackRateRef.current;
    const playbackSnapshot = resolvePlaybackMediaSnapshot({
      tracks: activeTracksRef.current,
      clipsByTrack: clipsByTrackRef.current,
      time: ct,
    });

    const shouldBeActive = new Map<
      string,
      { clip: Clip; sourceTimeOffset: number; clipRemaining: number }
    >();

    for (const clip of [...playbackSnapshot.activeVideoClips, ...playbackSnapshot.activeAudioClips]) {
      if (!isAudibleMediaClip(clip)) continue;
      if (!isAudioBufferReady(clip.sourceUrl)) {
        debugStatsRef.current.bufferMisses += 1;
        continue;
      }

      const clipTime = ct - clip.startTime;
      const sourceTime = getSourceTime(clip, ct);
      const clipRemaining = clip.duration - clipTime;

      shouldBeActive.set(clip.id, {
        clip,
        sourceTimeOffset: sourceTime,
        clipRemaining: getSourceDurationForTimelineDuration(clip, clipRemaining),
      });
    }

    for (const [clipId, node] of activeNodesRef.current) {
      if (shouldBeActive.has(clipId)) continue;
      node.sourceNode.onended = null;
      try {
        node.sourceNode.stop();
      } catch {
        // Already stopped.
      }
      node.sourceNode.disconnect();
      node.gainNode.disconnect();
      activeNodesRef.current.delete(clipId);
      debugStatsRef.current.stoppedNodes += 1;
    }

    for (const [clipId, { clip, sourceTimeOffset, clipRemaining }] of shouldBeActive) {
      const existing = activeNodesRef.current.get(clipId);
      if (existing) {
        const volume =
          (typeof (clip as { audioVolume?: number }).audioVolume === "number"
            ? (clip as { audioVolume: number }).audioVolume
            : 100) / 100;
        existing.gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime);
        continue;
      }

      const audioBuffer = getAudioBuffer(clip.sourceUrl);
      if (!audioBuffer) continue;
      if (sourceTimeOffset < 0 || sourceTimeOffset >= audioBuffer.duration) continue;

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.playbackRate.setValueAtTime(
        rate * getClipPlaybackSpeed(clip),
        ctx.currentTime,
      );

      const gainNode = ctx.createGain();
      const volume =
        (typeof (clip as { audioVolume?: number }).audioVolume === "number"
          ? (clip as { audioVolume: number }).audioVolume
          : 100) / 100;
      gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime);

      sourceNode.connect(gainNode);
      gainNode.connect(ctx.destination);

      const bufferRemaining = audioBuffer.duration - sourceTimeOffset;
      const playDuration = Math.min(clipRemaining, bufferRemaining);
      if (playDuration <= 0) continue;

      sourceNode.start(0, sourceTimeOffset, playDuration);
      debugStatsRef.current.startedNodes += 1;

      sourceNode.onended = () => {
        const activeNode = activeNodesRef.current.get(clipId);
        if (activeNode && activeNode.sourceNode === sourceNode) {
          activeNodesRef.current.delete(clipId);
        }
        debugStatsRef.current.endedNodes += 1;
        sourceNode.disconnect();
        gainNode.disconnect();
      };

      activeNodesRef.current.set(clipId, {
        clipId,
        sourceNode,
        gainNode,
      });
    }

    clearScheduledAudioCheck();
    if (isPlayingRef.current && isForegroundRef.current) {
      const nextBoundaryMs = playbackSnapshot.nextBoundaryTime !== null
        ? Math.max(
          24,
          (((playbackSnapshot.nextBoundaryTime - ct) / Math.max(0.01, rate)) * 1000) + 32,
        )
        : Number.POSITIVE_INFINITY;
      const nextScheduleDelayMs = Math.max(
        24,
        Math.min(WEB_AUDIO.SCHEDULER_INTERVAL_MS * 4, nextBoundaryMs),
      );
      schedulerTimerRef.current = setTimeout(() => {
        scheduleAudio();
      }, nextScheduleDelayMs);
    }

    maybeReportDebugStats();
  }, [clearScheduledAudioCheck, currentTimeRef, enabled, maybeReportDebugStats]);

  const rescheduleAudio = useCallback(() => {
    debugStatsRef.current.rescheduleCount += 1;
    stopAllNodes();
    if (isPlayingRef.current && isForegroundRef.current) {
      scheduleAudio();
    }
    maybeReportDebugStats();
  }, [maybeReportDebugStats, scheduleAudio, stopAllNodes]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeImmediatePlaybackStop(forceStopImmediately);
  }, [enabled, forceStopImmediately]);

  useEffect(() => {
    if (!enabled) return;

    const handleBackground = () => {
      isForegroundRef.current = false;
      stopAllNodes();
    };

    const handleVisible = () => {
      isForegroundRef.current = true;
      if (isPlayingRef.current) {
        scheduleAudio();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleVisible();
      } else {
        handleBackground();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBackground);
    window.addEventListener("focus", handleVisible);
    window.addEventListener("pagehide", handleBackground);
    window.addEventListener("pageshow", handleVisible);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBackground);
      window.removeEventListener("focus", handleVisible);
      window.removeEventListener("pagehide", handleBackground);
      window.removeEventListener("pageshow", handleVisible);
    };
  }, [enabled, scheduleAudio, stopAllNodes]);

  useEffect(() => {
    if (!enabled) return;

    lastTickTimeRef.current = currentTimeRef.current;
    lastTickWallTimeRef.current = nowMs();

    return playbackTick.subscribe((time) => {
      const now = nowMs();
      const prevTime = lastTickTimeRef.current;
      const prevWall = lastTickWallTimeRef.current || now;

      if (isPlayingRef.current) {
        const actualDelta = time - prevTime;
        const elapsedSec = Math.max(0, (now - prevWall) / 1000);
        const expectedDelta = elapsedSec * Math.max(0.01, playbackRateRef.current);

        const jumpMagnitude = Math.abs(actualDelta);
        const driftFromExpected = Math.abs(actualDelta - expectedDelta);
        const isBackwardJump = actualDelta < -WEB_AUDIO.BACKWARD_JUMP_EPSILON;
        const isLargeUnexpectedJump =
          jumpMagnitude > WEB_AUDIO.SEEK_JUMP_THRESHOLD
          && driftFromExpected > WEB_AUDIO.SEEK_DRIFT_TOLERANCE;

        if (isBackwardJump || isLargeUnexpectedJump) {
          const cooldownElapsed =
            now - lastRescheduleAtRef.current >= WEB_AUDIO.RESCHEDULE_MIN_INTERVAL_MS;
          if (cooldownElapsed) {
            rescheduleAudio();
            lastRescheduleAtRef.current = now;
          }
        }
      }

      lastTickTimeRef.current = time;
      lastTickWallTimeRef.current = now;
    });
  }, [currentTimeRef, enabled, nowMs, rescheduleAudio]);

  useEffect(() => {
    if (!enabled) {
      stopAllNodes();
      return;
    }

    if (isPlaying) {
      const ctx = getSharedAudioContext();
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }

      const now = nowMs();
      lastTickTimeRef.current = currentTimeRef.current;
      lastTickWallTimeRef.current = now;

      if (isForegroundRef.current) {
        scheduleAudio();
      }
    } else {
      stopAllNodes();

      const now = nowMs();
      lastTickTimeRef.current = currentTimeRef.current;
      lastTickWallTimeRef.current = now;
    }

    return () => {
      clearScheduledAudioCheck();
    };
  }, [clearScheduledAudioCheck, currentTimeRef, enabled, isPlaying, nowMs, scheduleAudio, stopAllNodes]);

  useEffect(() => {
    if (!enabled) return;
    const ctx = getSharedAudioContext();
    for (const [clipId, node] of activeNodesRef.current) {
      const clip = clipsRef.current.find((candidate) => candidate.id === clipId);
      const clipSpeed = clip ? getClipPlaybackSpeed(clip) : 1;
      node.sourceNode.playbackRate.setValueAtTime(playbackRate * clipSpeed, ctx.currentTime);
    }
  }, [clips, enabled, playbackRate]);

  useEffect(() => {
    return () => {
      stopAllNodes();
    };
  }, [stopAllNodes]);

  const isWebAudioReady = useCallback(
    (sourceUrl: string) => enabled && isAudioBufferReady(sourceUrl),
    [enabled],
  );

  return { isWebAudioReady };
}
