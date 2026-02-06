"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useVideoState, useVideoRefs, useTimeline } from "../contexts";
import { BUFFER } from "../constants";
import { VideoClip } from "../types";

export interface BufferState {
  isBuffering: boolean;
  bufferedAhead: number; // minimum seconds buffered ahead across active clips
}

/**
 * Monitors video element buffer state during playback.
 * Returns whether any active video clip needs buffering and can
 * auto-pause/resume playback when the buffer runs dry.
 */
export function useBufferMonitor(): BufferState {
  const { playback, currentTimeRef, isPlayingRef, pause, play } = useVideoState();
  const { videoElementsRef } = useVideoRefs();
  const { clips, tracks, getClipAtTime } = useTimeline();

  const [bufferState, setBufferState] = useState<BufferState>({
    isBuffering: false,
    bufferedAhead: Infinity,
  });

  // Track whether pause was triggered by buffer (not user)
  const bufferPausedRef = useRef(false);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getBufferedAhead = useCallback((video: HTMLVideoElement, sourceTime: number): number => {
    const buffered = video.buffered;
    for (let i = 0; i < buffered.length; i++) {
      if (sourceTime >= buffered.start(i) && sourceTime <= buffered.end(i)) {
        return buffered.end(i) - sourceTime;
      }
    }
    return 0;
  }, []);

  const checkBuffer = useCallback(() => {
    if (!isPlayingRef.current && !bufferPausedRef.current) return;

    const ct = currentTimeRef.current;
    let minBuffered = Infinity;
    let hasActiveVideo = false;

    for (const track of tracks) {
      if (!track.visible) continue;
      const clip = getClipAtTime(track.id, ct);
      if (!clip || !clip.visible || clip.type !== "video") continue;

      const videoClip = clip as VideoClip;
      const video = videoElementsRef.current?.get(videoClip.sourceUrl);
      if (!video) continue;

      hasActiveVideo = true;
      const clipTime = ct - clip.startTime;
      const sourceTime = clip.trimIn + clipTime;
      const ahead = getBufferedAhead(video, sourceTime);
      minBuffered = Math.min(minBuffered, ahead);
    }

    if (!hasActiveVideo) {
      // No video clips active — no buffering needed
      if (bufferPausedRef.current) {
        bufferPausedRef.current = false;
        play();
      }
      setBufferState({ isBuffering: false, bufferedAhead: Infinity });
      return;
    }

    const needsBuffer = minBuffered < BUFFER.CRITICAL_THRESHOLD;
    const canResume = minBuffered >= BUFFER.RESUME_THRESHOLD;

    // Auto-pause when buffer runs out
    if (needsBuffer && isPlayingRef.current && !bufferPausedRef.current) {
      bufferPausedRef.current = true;
      pause();
    }

    // Auto-resume when enough is buffered
    if (bufferPausedRef.current && canResume) {
      bufferPausedRef.current = false;
      play();
    }

    setBufferState({
      isBuffering: needsBuffer || bufferPausedRef.current,
      bufferedAhead: minBuffered,
    });
  }, [tracks, clips, getClipAtTime, videoElementsRef, currentTimeRef, isPlayingRef, pause, play, getBufferedAhead]);

  useEffect(() => {
    if (playback.isPlaying || bufferPausedRef.current) {
      checkBuffer(); // Immediate check
      checkIntervalRef.current = setInterval(checkBuffer, BUFFER.CHECK_INTERVAL_MS);
    } else {
      // Not playing and not buffer-paused — clear
      if (bufferPausedRef.current) {
        bufferPausedRef.current = false;
      }
      setBufferState({ isBuffering: false, bufferedAhead: Infinity });
    }

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [playback.isPlaying, checkBuffer]);

  return bufferState;
}
