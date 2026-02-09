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

// --- Types ---

interface ActiveAudioNode {
  clipId: string;
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
}

interface UseWebAudioPlaybackParams {
  tracks: VideoTrack[];
  clips: Clip[];
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  isPlaying: boolean;
  playbackRate: number;
  currentTimeRef: React.RefObject<number>;
}

// --- Hook ---

export function useWebAudioPlayback(params: UseWebAudioPlaybackParams) {
  const { tracks, clips, getClipAtTime, isPlaying, playbackRate, currentTimeRef } =
    params;

  const activeNodesRef = useRef<Map<string, ActiveAudioNode>>(new Map());
  const schedulerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickTimeRef = useRef<number>(0);

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

  // Stop all active audio source nodes
  const stopAllNodes = useCallback(() => {
    for (const [, node] of activeNodesRef.current) {
      try {
        node.sourceNode.stop();
      } catch {
        // Already stopped
      }
      node.sourceNode.disconnect();
      node.gainNode.disconnect();
    }
    activeNodesRef.current.clear();
  }, []);

  // Schedule audio nodes for all audible clips at current time
  const scheduleAudio = useCallback(() => {
    if (!isPlayingRef.current) return;

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
      if (!isAudioBufferReady(clip.sourceUrl)) continue;

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
        try {
          node.sourceNode.stop();
        } catch {
          // Already stopped
        }
        node.sourceNode.disconnect();
        node.gainNode.disconnect();
        activeNodesRef.current.delete(clipId);
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

      // Auto-cleanup when source node finishes
      sourceNode.onended = () => {
        activeNodesRef.current.delete(clipId);
        sourceNode.disconnect();
        gainNode.disconnect();
      };

      activeNodesRef.current.set(clipId, {
        clipId,
        sourceNode,
        gainNode,
      });
    }
  }, [currentTimeRef]);

  // Reschedule all audio from scratch (for seek events)
  const rescheduleAudio = useCallback(() => {
    stopAllNodes();
    if (isPlayingRef.current) {
      scheduleAudio();
    }
  }, [stopAllNodes, scheduleAudio]);

  // Detect seek via playbackTick time jumps
  useEffect(() => {
    lastTickTimeRef.current = currentTimeRef.current;

    return playbackTick.subscribe((time) => {
      const jump = Math.abs(time - lastTickTimeRef.current);
      if (jump > WEB_AUDIO.SEEK_JUMP_THRESHOLD && isPlayingRef.current) {
        // Large time jump = seek — reschedule all audio
        rescheduleAudio();
      }
      lastTickTimeRef.current = time;
    });
  }, [rescheduleAudio, currentTimeRef]);

  // Start/stop audio on play state change
  useEffect(() => {
    if (isPlaying) {
      const ctx = getSharedAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      // Initial schedule
      scheduleAudio();

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
    }

    return () => {
      if (schedulerTimerRef.current !== null) {
        clearInterval(schedulerTimerRef.current);
        schedulerTimerRef.current = null;
      }
    };
  }, [isPlaying, scheduleAudio, stopAllNodes]);

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
