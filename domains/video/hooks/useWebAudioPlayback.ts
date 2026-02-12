"use client";

import { useEffect, useRef, useCallback } from "react";
import { VideoTrack, Clip } from "../types";
import { WEB_AUDIO } from "../constants";
import {
  getAudioBuffer,
  isAudioBufferReady,
  getSharedAudioContext,
} from "./useAudioBufferCache";
import { playbackTick } from "../utils/playbackTick";
import { subscribeImmediatePlaybackStop } from "../utils/playbackStopSignal";

// --- Types ---

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
}

// --- Hook ---

export function useWebAudioPlayback(params: UseWebAudioPlaybackParams) {
  const { tracks, clips, getClipAtTime, isPlaying, playbackRate, currentTimeRef, debugLogs = false } =
    params;

  const activeNodesRef = useRef<Map<string, ActiveAudioNode>>(new Map());
  const schedulerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // Keep latest values in refs for use inside callbacks
  const tracksRef = useRef(tracks);
  const clipsRef = useRef(clips);
  const getClipAtTimeRef = useRef(getClipAtTime);
  const playbackRateRef = useRef(playbackRate);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { getClipAtTimeRef.current = getClipAtTime; }, [getClipAtTime]);
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

  // Stop all active audio source nodes
  const stopAllNodes = useCallback(() => {
    for (const [, node] of activeNodesRef.current) {
      // Prevent stale onended callbacks from touching the active map
      // after we have already force-stopped and re-scheduled nodes.
      node.sourceNode.onended = null;
      try {
        node.sourceNode.stop();
      } catch {
        // Already stopped
      }
      node.sourceNode.disconnect();
      node.gainNode.disconnect();
      debugStatsRef.current.stoppedNodes += 1;
    }
    activeNodesRef.current.clear();
  }, []);

  const forceStopImmediately = useCallback(() => {
    // Block any pending scheduler callback from re-creating nodes
    // before React state propagation catches up.
    isPlayingRef.current = false;
    stopAllNodes();
    if (schedulerTimerRef.current !== null) {
      clearInterval(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
    // Hard mute any stray WebAudio output path immediately.
    // play() path resumes context again.
    const ctx = getSharedAudioContext();
    if (ctx.state === "running") {
      void ctx.suspend().catch(() => {});
    }
  }, [stopAllNodes]);

  // Schedule audio nodes for all audible clips at current time
  const scheduleAudio = useCallback(() => {
    if (!isPlayingRef.current || !isForegroundRef.current) return;
    debugStatsRef.current.scheduleRuns += 1;

    const ctx = getSharedAudioContext();
    const ct = currentTimeRef.current;
    const currentTracks = tracksRef.current;
    const rate = playbackRateRef.current;

    // 1. Collect clips that should be playing right now
    const shouldBeActive = new Map<
      string,
      { clip: Clip; sourceTimeOffset: number; clipRemaining: number }
    >();

    for (const track of currentTracks) {
      if (!track.visible || track.muted) continue;

      const clip = getClipAtTimeRef.current(track.id, ct);
      if (!clip || !clip.visible) continue;

      // Check if clip has audible audio
      let isAudible = false;
      let volume = 100;

      if (clip.type === "video") {
        isAudible =
          (clip.hasAudio ?? true) &&
          !(clip.audioMuted ?? false);
        volume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
      } else if (clip.type === "audio") {
        isAudible = !(clip.audioMuted ?? false);
        volume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
      }

      if (!isAudible || volume <= 0) continue;

      // Check if AudioBuffer is available
      if (!isAudioBufferReady(clip.sourceUrl)) {
        debugStatsRef.current.bufferMisses += 1;
        continue;
      }

      const clipTime = ct - clip.startTime;
      const sourceTime = clip.trimIn + clipTime;
      const clipRemaining = clip.duration - clipTime;

      shouldBeActive.set(clip.id, {
        clip,
        sourceTimeOffset: sourceTime,
        clipRemaining,
      });
    }

    // 2. Remove nodes for clips that are no longer active
    for (const [clipId, node] of activeNodesRef.current) {
      if (!shouldBeActive.has(clipId)) {
        node.sourceNode.onended = null;
        try {
          node.sourceNode.stop();
        } catch {
          // Already stopped
        }
        node.sourceNode.disconnect();
        node.gainNode.disconnect();
        activeNodesRef.current.delete(clipId);
        debugStatsRef.current.stoppedNodes += 1;
      }
    }

    // 3. Create nodes for newly active clips, update volume for existing ones
    for (const [clipId, { clip, sourceTimeOffset, clipRemaining }] of shouldBeActive) {
      const existing = activeNodesRef.current.get(clipId);

      if (existing) {
        // Already playing — just update volume
        const volume =
          (typeof (clip as { audioVolume?: number }).audioVolume === "number"
            ? (clip as { audioVolume: number }).audioVolume
            : 100) / 100;
        existing.gainNode.gain.setValueAtTime(
          Math.max(0, Math.min(1, volume)),
          ctx.currentTime
        );
        continue;
      }

      // Create new source node
      const audioBuffer = getAudioBuffer(clip.sourceUrl);
      if (!audioBuffer) continue;

      // Validate offset is within buffer bounds
      if (sourceTimeOffset < 0 || sourceTimeOffset >= audioBuffer.duration) continue;

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.playbackRate.setValueAtTime(rate, ctx.currentTime);

      const gainNode = ctx.createGain();
      const volume =
        (typeof (clip as { audioVolume?: number }).audioVolume === "number"
          ? (clip as { audioVolume: number }).audioVolume
          : 100) / 100;
      gainNode.gain.setValueAtTime(
        Math.max(0, Math.min(1, volume)),
        ctx.currentTime
      );

      sourceNode.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Calculate play duration (clamped to remaining buffer)
      const bufferRemaining = audioBuffer.duration - sourceTimeOffset;
      const playDuration = Math.min(clipRemaining, bufferRemaining);

      if (playDuration <= 0) continue;

      sourceNode.start(0, sourceTimeOffset, playDuration);
      debugStatsRef.current.startedNodes += 1;

      // Auto-cleanup when source node finishes
      sourceNode.onended = () => {
        // Guard against stop/reschedule races:
        // only remove the node if this callback belongs to
        // the currently registered active node for this clip.
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
    maybeReportDebugStats();
  }, [currentTimeRef, maybeReportDebugStats]);

  // Reschedule all audio from scratch (for seek events)
  const rescheduleAudio = useCallback(() => {
    debugStatsRef.current.rescheduleCount += 1;
    stopAllNodes();
    if (isPlayingRef.current && isForegroundRef.current) {
      scheduleAudio();
    }
    maybeReportDebugStats();
  }, [stopAllNodes, scheduleAudio, maybeReportDebugStats]);

  // Hard-stop on external pause/navigation signal.
  useEffect(() => {
    return subscribeImmediatePlaybackStop(forceStopImmediately);
  }, [forceStopImmediately]);

  // Force-stop audio when app loses foreground.
  useEffect(() => {
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
  }, [scheduleAudio, stopAllNodes]);

  // Detect seek/loop wrap via timeline jump relative to wall-time progression.
  // This avoids false seek detection when rendering is slow (large but expected deltas).
  useEffect(() => {
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
            // Reschedule only on true timeline discontinuity (seek / loop wrap).
            rescheduleAudio();
            lastRescheduleAtRef.current = now;
          }
        }
      }

      lastTickTimeRef.current = time;
      lastTickWallTimeRef.current = now;
    });
  }, [rescheduleAudio, currentTimeRef, nowMs]);

  // Start/stop audio on play state change
  useEffect(() => {
    if (isPlaying) {
      const ctx = getSharedAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const now = nowMs();
      lastTickTimeRef.current = currentTimeRef.current;
      lastTickWallTimeRef.current = now;

      // Initial schedule
      if (isForegroundRef.current) {
        scheduleAudio();
      }

      // Periodic scheduler for clip boundary transitions
      schedulerTimerRef.current = setInterval(() => {
        scheduleAudio();
      }, WEB_AUDIO.SCHEDULER_INTERVAL_MS);
    } else {
      // Stop all audio
      stopAllNodes();

      if (schedulerTimerRef.current !== null) {
        clearInterval(schedulerTimerRef.current);
        schedulerTimerRef.current = null;
      }

      const now = nowMs();
      lastTickTimeRef.current = currentTimeRef.current;
      lastTickWallTimeRef.current = now;
    }

    return () => {
      if (schedulerTimerRef.current !== null) {
        clearInterval(schedulerTimerRef.current);
        schedulerTimerRef.current = null;
      }
    };
  }, [isPlaying, scheduleAudio, stopAllNodes, currentTimeRef, nowMs]);

  // Update playbackRate on all active source nodes
  useEffect(() => {
    const ctx = getSharedAudioContext();
    for (const [, node] of activeNodesRef.current) {
      node.sourceNode.playbackRate.setValueAtTime(playbackRate, ctx.currentTime);
    }
  }, [playbackRate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllNodes();
      if (schedulerTimerRef.current !== null) {
        clearInterval(schedulerTimerRef.current);
      }
    };
  }, [stopAllNodes]);

  // Public API
  const isWebAudioReady = useCallback(
    (sourceUrl: string) => isAudioBufferReady(sourceUrl),
    []
  );

  return { isWebAudioReady };
}
