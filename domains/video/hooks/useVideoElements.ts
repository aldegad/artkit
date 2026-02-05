"use client";

import { useCallback, useEffect, useRef } from "react";
import { useVideoRefs, useTimeline } from "../contexts";
import { VideoClip } from "../types";

/**
 * Manages a pool of video elements for frame extraction
 */
export function useVideoElements() {
  const { videoElementsRef } = useVideoRefs();
  const { clips } = useTimeline();
  const loadedSourcesRef = useRef<Set<string>>(new Set());

  // Create or get video element for a source URL
  const getVideoElement = useCallback(
    (sourceUrl: string): HTMLVideoElement | null => {
      if (!videoElementsRef.current) return null;

      let video = videoElementsRef.current.get(sourceUrl);
      if (!video) {
        video = document.createElement("video");
        video.src = sourceUrl;
        video.preload = "auto";
        video.muted = true; // Mute for autoplay policy
        video.playsInline = true;
        videoElementsRef.current.set(sourceUrl, video);
      }
      return video;
    },
    [videoElementsRef]
  );

  // Preload video elements for all video clips
  const preloadVideos = useCallback(() => {
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");

    for (const clip of videoClips) {
      if (!loadedSourcesRef.current.has(clip.sourceUrl)) {
        const video = getVideoElement(clip.sourceUrl);
        if (video) {
          video.load();
          loadedSourcesRef.current.add(clip.sourceUrl);
        }
      }
    }
  }, [clips, getVideoElement]);

  // Seek a video element to a specific time
  const seekVideo = useCallback(
    async (sourceUrl: string, time: number): Promise<void> => {
      const video = getVideoElement(sourceUrl);
      if (!video) return;

      return new Promise((resolve) => {
        if (Math.abs(video.currentTime - time) < 0.05) {
          resolve();
          return;
        }

        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };

        video.addEventListener("seeked", onSeeked);
        video.currentTime = time;
      });
    },
    [getVideoElement]
  );

  // Get current frame from video as canvas
  const getVideoFrame = useCallback(
    (sourceUrl: string): HTMLCanvasElement | null => {
      const video = getVideoElement(sourceUrl);
      if (!video || video.readyState < 2) return null;

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0);
      return canvas;
    },
    [getVideoElement]
  );

  // Cleanup video elements on unmount
  useEffect(() => {
    return () => {
      if (videoElementsRef.current) {
        videoElementsRef.current.forEach((video) => {
          video.pause();
          video.src = "";
          video.load();
        });
        videoElementsRef.current.clear();
      }
      loadedSourcesRef.current.clear();
    };
  }, [videoElementsRef]);

  // Preload when clips change
  useEffect(() => {
    preloadVideos();
  }, [preloadVideos]);

  return {
    getVideoElement,
    seekVideo,
    getVideoFrame,
    preloadVideos,
  };
}
