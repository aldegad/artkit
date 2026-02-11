"use client";

import { useEffect, MutableRefObject, RefObject } from "react";
import { Clip, VideoClip } from "../../types";

interface UsePreviewMediaReadyRenderOptions {
  clips: Clip[];
  videoElementsRef: RefObject<Map<string, HTMLVideoElement>>;
  isPreRenderingRef: RefObject<boolean>;
  wasPlayingRef: MutableRefObject<boolean>;
  scheduleRender: () => void;
  renderRequestRef: MutableRefObject<number>;
}

export function usePreviewMediaReadyRender(options: UsePreviewMediaReadyRenderOptions) {
  const {
    clips,
    videoElementsRef,
    isPreRenderingRef,
    wasPlayingRef,
    scheduleRender,
    renderRequestRef,
  } = options;

  // Setup video ready listeners - trigger render via rAF only when paused (scrubbing)
  useEffect(() => {
    const videoClips = clips.filter((clip): clip is VideoClip => clip.type === "video");
    const cleanupFns: Array<() => void> = [];

    const scheduleRenderFromMediaReady = () => {
      // During playback, the playback loop already drives rendering.
      if (wasPlayingRef.current) return;
      // During pre-rendering, the pre-render loop seeks video elements to
      // different times. Don't re-render in response — it would fight over
      // video element currentTime and cause frame drops.
      if (isPreRenderingRef.current) return;
      scheduleRender();
    };

    for (const clip of videoClips) {
      const video = videoElementsRef.current?.get(clip.id);
      if (!video) continue;

      video.addEventListener("canplay", scheduleRenderFromMediaReady);
      video.addEventListener("seeked", scheduleRenderFromMediaReady);
      video.addEventListener("loadeddata", scheduleRenderFromMediaReady);

      cleanupFns.push(() => {
        video.removeEventListener("canplay", scheduleRenderFromMediaReady);
        video.removeEventListener("seeked", scheduleRenderFromMediaReady);
        video.removeEventListener("loadeddata", scheduleRenderFromMediaReady);
      });
    }

    return () => {
      cancelAnimationFrame(renderRequestRef.current);
      cleanupFns.forEach((fn) => fn());
    };
  }, [clips, videoElementsRef, isPreRenderingRef, wasPlayingRef, scheduleRender, renderRequestRef]);
}
