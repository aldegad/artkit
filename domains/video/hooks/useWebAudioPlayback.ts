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
  resolveLookaheadStart,
  resolvePlaybackMediaSnapshot,
  resolveUpcomingAudioClips,
} from "../utils/playbackActiveMedia";

interface ActiveAudioNode {
  clipId: string;
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
  /**
   * AudioContext time this node was armed to start at. A node whose value is still
   * in the future has NOT sounded yet (lookahead), which the cleanup pass and the
   * rate-change effect both need to know. Kept on the node instead of in a second
   * map so there is one place that says when a node starts.
   */
  scheduledStartContextTime: number;
}

interface AudioDebugStats {
  startedNodes: number;
  armedNodes: number;
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
    armedNodes: 0,
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
      armedNodes: stats.armedNodes,
      stoppedNodes: stats.stoppedNodes,
      endedNodes: stats.endedNodes,
      bufferMisses: stats.bufferMisses,
      reschedules: stats.rescheduleCount,
    });

    stats.startedNodes = 0;
    stats.armedNodes = 0;
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

    // Two kinds of target, one start path.
    //  - already playing: start now from the current offset (the late fallback)
    //  - about to start:  arm on the audio clock so the attack is not clipped
    const targets = new Map<
      string,
      { clip: Clip; sourceTimeOffset: number; clipRemaining: number; startAt: number }
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

      targets.set(clip.id, {
        clip,
        sourceTimeOffset: sourceTime,
        clipRemaining: getSourceDurationForTimelineDuration(clip, clipRemaining),
        // 0 means "now" to AudioBufferSourceNode.start.
        startAt: 0,
      });
    }

    const upcomingClips = resolveUpcomingAudioClips({
      tracks: activeTracksRef.current,
      clipsByTrack: clipsByTrackRef.current,
      time: ct,
      lookAhead: (WEB_AUDIO.LOOKAHEAD_MS / 1000) * Math.max(0.01, rate),
    });

    for (const clip of upcomingClips) {
      if (targets.has(clip.id)) continue;
      if (!isAudioBufferReady(clip.sourceUrl)) {
        debugStatsRef.current.bufferMisses += 1;
        continue;
      }

      const { when, isFuture } = resolveLookaheadStart({
        clipStartTime: clip.startTime,
        currentTime: ct,
        rate,
        contextTime: ctx.currentTime,
      });
      if (!isFuture) continue;

      targets.set(clip.id, {
        clip,
        // A clip that has not started yet plays from its own trim-in, not from an
        // offset derived from the current playhead.
        sourceTimeOffset: getSourceTime(clip, clip.startTime),
        clipRemaining: getSourceDurationForTimelineDuration(clip, clip.duration),
        startAt: when,
      });
    }

    // Keep-set is "playing now OR due soon". Because `targets` carries the upcoming
    // clips too, an armed-but-unsounded node survives this pass on its own merit —
    // no pending-node exemption is needed, and none is wanted: an exemption would
    // also protect a node whose clip the user just deleted mid-playback, firing a
    // phantom hit. Absent from `targets` means absent from the timeline.
    for (const [clipId, node] of activeNodesRef.current) {
      if (targets.has(clipId)) continue;
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

    for (const [clipId, { clip, sourceTimeOffset, clipRemaining, startAt }] of targets) {
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

      sourceNode.start(startAt, sourceTimeOffset, playDuration);
      if (startAt > ctx.currentTime) {
        debugStatsRef.current.armedNodes += 1;
      } else {
        debugStatsRef.current.startedNodes += 1;
      }

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
        scheduledStartContextTime: startAt > 0 ? startAt : ctx.currentTime,
      });
    }

    clearScheduledAudioCheck();
    if (isPlayingRef.current && isForegroundRef.current) {
      // Wake BEFORE the next boundary, by the lookahead, so the clip can be armed
      // while it is still in the future. The old `+ 32` woke us after the boundary,
      // which cost every one-shot at least 32ms of attack even with zero jitter.
      const nextBoundaryMs = playbackSnapshot.nextBoundaryTime !== null
        ? Math.max(
          24,
          (((playbackSnapshot.nextBoundaryTime - ct) / Math.max(0.01, rate)) * 1000)
            - WEB_AUDIO.LOOKAHEAD_MS,
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

      // An armed node's start time was computed from the OLD rate, and changing
      // playbackRate does not move it. Setting the rate would keep a node that
      // fires at the wrong moment, so drop it and let the next pass re-arm.
      if (node.scheduledStartContextTime > ctx.currentTime) {
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
        continue;
      }

      node.sourceNode.playbackRate.setValueAtTime(playbackRate * clipSpeed, ctx.currentTime);
    }
    if (isPlayingRef.current && isForegroundRef.current) {
      scheduleAudio();
    }
  }, [clips, enabled, playbackRate, scheduleAudio]);

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
