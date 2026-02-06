"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useVideoRefs, useTimeline } from "../contexts";
import { VideoClip } from "../types";
import { BUFFER } from "../constants";

export interface ClipBufferRange {
  start: number; // clip-local seconds (0 = clip start)
  end: number; // clip-local seconds
}

export type ClipBufferMap = Map<string, ClipBufferRange[]>;

/**
 * Polls video element buffered ranges for all video clips and returns
 * a map of clip-local buffered ranges for timeline visualization.
 * Always includes an entry for every video clip (empty array if not buffered yet).
 */
export function useClipBufferRanges(): ClipBufferMap {
  const { videoElementsRef } = useVideoRefs();
  const { clips } = useTimeline();
  const [bufferMap, setBufferMap] = useState<ClipBufferMap>(() => new Map());
  const prevSerialRef = useRef("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkBufferRanges = useCallback(() => {
    const map: ClipBufferMap = new Map();
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");

    for (const clip of videoClips) {
      const video = videoElementsRef.current?.get(clip.sourceUrl);
      if (!video) {
        // Video element not created yet — include with empty ranges
        map.set(clip.id, []);
        continue;
      }

      const ranges: ClipBufferRange[] = [];
      const buffered = video.buffered;

      for (let i = 0; i < buffered.length; i++) {
        const srcStart = buffered.start(i);
        const srcEnd = buffered.end(i);

        // Intersect with clip's source window [trimIn, trimOut]
        const intStart = Math.max(srcStart, clip.trimIn);
        const intEnd = Math.min(srcEnd, clip.trimOut);

        if (intEnd > intStart) {
          ranges.push({
            start: intStart - clip.trimIn,
            end: intEnd - clip.trimIn,
          });
        }
      }

      map.set(clip.id, ranges);
    }

    // Only update state if changed
    const serial = JSON.stringify(Array.from(map.entries()));
    if (serial !== prevSerialRef.current) {
      prevSerialRef.current = serial;
      setBufferMap(map);
    }
  }, [clips, videoElementsRef]);

  useEffect(() => {
    checkBufferRanges();
    intervalRef.current = setInterval(checkBufferRanges, BUFFER.VISUAL_POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkBufferRanges]);

  return bufferMap;
}
