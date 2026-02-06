"use client";

import { useEffect, useRef, useState } from "react";
import { playbackTick } from "../utils/playbackTick";
import { useVideoState } from "../contexts";

/**
 * Subscribe to every playback tick and run an imperative callback.
 * Does NOT cause React re-renders — ideal for canvas/DOM updates.
 */
export function usePlaybackTick(callback: (time: number) => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return playbackTick.subscribe((time) => {
      callbackRef.current(time);
    });
  }, []);
}

/**
 * Returns playback time as React state, throttled to reduce re-renders.
 * Use for text displays (time code, etc.) that don't need 60fps updates.
 *
 * @param throttleMs Minimum ms between state updates (default 100 = 10fps)
 */
export function usePlaybackTime(throttleMs: number = 100): number {
  const { playback } = useVideoState();
  const [displayTime, setDisplayTime] = useState(playback.currentTime);
  const lastUpdateRef = useRef(0);

  // Sync when state changes (seek, stop, pause)
  useEffect(() => {
    setDisplayTime(playback.currentTime);
  }, [playback.currentTime]);

  // Throttled updates during playback
  useEffect(() => {
    return playbackTick.subscribe((time) => {
      const now = performance.now();
      if (now - lastUpdateRef.current >= throttleMs) {
        lastUpdateRef.current = now;
        setDisplayTime(time);
      }
    });
  }, [throttleMs]);

  return displayTime;
}
