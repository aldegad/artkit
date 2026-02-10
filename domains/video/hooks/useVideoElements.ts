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
  const loadedVideoClipIdsRef = useRef<Set<string>>(new Set());
  const loadedAudioClipIdsRef = useRef<Set<string>>(new Set());
  const videoSourceByClipIdRef = useRef<Map<string, string>>(new Map());
  const audioSourceByClipIdRef = useRef<Map<string, string>>(new Map());

  // Create or get video element for a clip instance
  const getVideoElement = useCallback(
    (clipId: string): HTMLVideoElement | null => {
      if (!videoElementsRef.current) return null;

      let video = videoElementsRef.current.get(clipId);
      if (!video) {
        video = document.createElement("video");
        video.preload = "auto";
        video.muted = true; // Mute for autoplay policy
        video.playsInline = true;
        videoElementsRef.current.set(clipId, video);
      }
      return video;
    },
    [videoElementsRef]
  );

  // Create or get audio element for a clip instance
  const getAudioElement = useCallback(
    (clipId: string): HTMLAudioElement | null => {
      if (!audioElementsRef.current) return null;

      let audio = audioElementsRef.current.get(clipId);
      if (!audio) {
        audio = document.createElement("audio");
        audio.preload = "auto";
        audio.muted = true;
        audioElementsRef.current.set(clipId, audio);
      }
      return audio;
    },
    [audioElementsRef]
  );

  // Sync media element pool to current clips (clip.id-keyed instance pool)
  const preloadVideos = useCallback(() => {
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");
    const audioClips = clips.filter((c): c is AudioClip => c.type === "audio");
    const activeVideoClipIds = new Set<string>();
    const activeAudioClipIds = new Set<string>();

    for (const clip of videoClips) {
      activeVideoClipIds.add(clip.id);
      const video = getVideoElement(clip.id);
      if (!video) continue;

      const prevSource = videoSourceByClipIdRef.current.get(clip.id);
      if (prevSource !== clip.sourceUrl) {
        video.pause();
        video.src = clip.sourceUrl;
        videoSourceByClipIdRef.current.set(clip.id, clip.sourceUrl);
        loadedVideoClipIdsRef.current.delete(clip.id);
      }

      if (!loadedVideoClipIdsRef.current.has(clip.id)) {
        video.load();
        loadedVideoClipIdsRef.current.add(clip.id);
      }
    }

    for (const clip of audioClips) {
      activeAudioClipIds.add(clip.id);
      const audio = getAudioElement(clip.id);
      if (!audio) continue;

      const prevSource = audioSourceByClipIdRef.current.get(clip.id);
      if (prevSource !== clip.sourceUrl) {
        audio.pause();
        audio.src = clip.sourceUrl;
        audioSourceByClipIdRef.current.set(clip.id, clip.sourceUrl);
        loadedAudioClipIdsRef.current.delete(clip.id);
      }

      if (!loadedAudioClipIdsRef.current.has(clip.id)) {
        audio.load();
        loadedAudioClipIdsRef.current.add(clip.id);
      }
    }

    if (videoElementsRef.current) {
      for (const [clipId, video] of videoElementsRef.current) {
        if (activeVideoClipIds.has(clipId)) continue;
        video.pause();
        video.src = "";
        video.load();
        videoElementsRef.current.delete(clipId);
        loadedVideoClipIdsRef.current.delete(clipId);
        videoSourceByClipIdRef.current.delete(clipId);
      }
    }

    if (audioElementsRef.current) {
      for (const [clipId, audio] of audioElementsRef.current) {
        if (activeAudioClipIds.has(clipId)) continue;
        audio.pause();
        audio.src = "";
        audio.load();
        audioElementsRef.current.delete(clipId);
        loadedAudioClipIdsRef.current.delete(clipId);
        audioSourceByClipIdRef.current.delete(clipId);
      }
    }
  }, [clips, getVideoElement, getAudioElement, videoElementsRef, audioElementsRef]);

  // Seek a video element to a specific time
  const seekVideo = useCallback(
    async (clipId: string, time: number): Promise<void> => {
      const video = getVideoElement(clipId);
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
    (clipId: string): HTMLCanvasElement | null => {
      const video = getVideoElement(clipId);
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
      loadedVideoClipIdsRef.current.clear();
      loadedAudioClipIdsRef.current.clear();
      videoSourceByClipIdRef.current.clear();
      audioSourceByClipIdRef.current.clear();
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
