"use client";

import { useEffect } from "react";

interface UseAutoPauseOnHiddenOptions {
  isPlaying: boolean;
  pause: () => void;
}

export function useAutoPauseOnHidden(options: UseAutoPauseOnHiddenOptions): void {
  const { isPlaying, pause } = options;

  useEffect(() => {
    const pausePlaybackIfNeeded = () => {
      if (!isPlaying) return;
      pause();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        pausePlaybackIfNeeded();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", pausePlaybackIfNeeded);
    window.addEventListener("pagehide", pausePlaybackIfNeeded);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", pausePlaybackIfNeeded);
      window.removeEventListener("pagehide", pausePlaybackIfNeeded);
    };
  }, [isPlaying, pause]);
}
