"use client";

import { useCallback, useEffect, useRef } from "react";
import { useVideoRefs, useTimeline } from "../contexts";
import { VideoClip, AudioClip } from "../types";

/**
 * Manages a pool of video elements for frame extraction
 */
export function useVideoElements() {
  const { videoElementsRef, audioElementsRef } = useVideoRefs();
  const { clips } = useTimeline();
  const loadedVideoSourcesRef = useRef<Set<string>>(new Set());
  const loadedAudioSourcesRef = useRef<Set<string>>(new Set());

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

  // Create or get audio element for a source URL
  const getAudioElement = useCallback(
    (sourceUrl: string): HTMLAudioElement | null => {
      if (!audioElementsRef.current) return null;

      let audio = audioElementsRef.current.get(sourceUrl);
      if (!audio) {
        audio = document.createElement("audio");
        audio.src = sourceUrl;
        audio.preload = "auto";
        audio.muted = true;
        audioElementsRef.current.set(sourceUrl, audio);
      }
      return audio;
    },
    [audioElementsRef]
  );

  // Preload video elements for all video clips
  const preloadVideos = useCallback(() => {
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");
    const audioClips = clips.filter((c): c is AudioClip => c.type === "audio");

    for (const clip of videoClips) {
      if (!loadedVideoSourcesRef.current.has(clip.sourceUrl)) {
        const video = getVideoElement(clip.sourceUrl);
        if (video) {
          video.load();
          loadedVideoSourcesRef.current.add(clip.sourceUrl);
        }
      }
    }

    for (const clip of audioClips) {
      if (!loadedAudioSourcesRef.current.has(clip.sourceUrl)) {
        const audio = getAudioElement(clip.sourceUrl);
        if (audio) {
          audio.load();
          loadedAudioSourcesRef.current.add(clip.sourceUrl);
        }
      }
    }
  }, [clips, getVideoElement, getAudioElement]);

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
      if (audioElementsRef.current) {
        audioElementsRef.current.forEach((audio) => {
          audio.pause();
          audio.src = "";
          audio.load();
        });
        audioElementsRef.current.clear();
      }
      loadedVideoSourcesRef.current.clear();
      loadedAudioSourcesRef.current.clear();
    };
  }, [videoElementsRef, audioElementsRef]);

  // Preload when clips change
  useEffect(() => {
    preloadVideos();
  }, [preloadVideos]);

  return {
    getVideoElement,
    getAudioElement,
    seekVideo,
    getVideoFrame,
    preloadVideos,
  };
}
