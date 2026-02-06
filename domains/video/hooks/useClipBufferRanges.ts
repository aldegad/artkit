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
 */
export function useClipBufferRanges(): ClipBufferMap {
  const { videoElementsRef } = useVideoRefs();
  const { clips } = useTimeline();
  const [bufferMap, setBufferMap] = useState<ClipBufferMap>(() => new Map());
  const prevSerialRef = useRef("");

  const computeBufferMap = useCallback((): ClipBufferMap => {
    const map: ClipBufferMap = new Map();
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");

    for (const clip of videoClips) {
      const video = videoElementsRef.current?.get(clip.sourceUrl);
      if (!video) continue;

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

      if (ranges.length > 0) {
        map.set(clip.id, ranges);
      }
    }

    return map;
  }, [clips, videoElementsRef]);

  useEffect(() => {
    const update = () => {
      const newMap = computeBufferMap();
      const serial = JSON.stringify(Array.from(newMap.entries()));
      if (serial !== prevSerialRef.current) {
        prevSerialRef.current = serial;
        setBufferMap(newMap);
      }
    };

    // Listen to progress events on all video elements
    const videos = videoElementsRef.current;
    const handler = () => update();
    videos?.forEach((video) => video.addEventListener("progress", handler));

    // Fallback interval
    const interval = setInterval(update, BUFFER.VISUAL_POLL_INTERVAL_MS);
    update();

    return () => {
      clearInterval(interval);
      videos?.forEach((video) => video.removeEventListener("progress", handler));
    };
  }, [computeBufferMap, videoElementsRef]);

  return bufferMap;
}
