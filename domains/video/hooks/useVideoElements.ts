"use client";

import { useCallback, useEffect, useRef } from "react";
import { useVideoRefs, useTimeline } from "../contexts";
import { VideoClip, AudioClip } from "../types";

type TimelineMediaClip = Pick<
  VideoClip | AudioClip,
  "id" | "sourceId" | "sourceUrl" | "startTime" | "duration"
>;

const CLIP_INTERVAL_EPSILON = 1e-6;

function getSharedMediaSourceKey(clip: TimelineMediaClip): string {
  const sourceKey = clip.sourceId || clip.sourceUrl || clip.id;
  return `${sourceKey}`;
}

function buildSharedPoolAssignments<T extends TimelineMediaClip>(
  clips: T[],
  kind: "video" | "audio"
): Map<string, string> {
  const assignments = new Map<string, string>();
  const clipsBySource = new Map<string, T[]>();

  for (const clip of clips) {
    const sourceKey = getSharedMediaSourceKey(clip);
    const group = clipsBySource.get(sourceKey) || [];
    group.push(clip);
    clipsBySource.set(sourceKey, group);
  }

  for (const [sourceKey, groupedClips] of clipsBySource) {
    const sortedClips = [...groupedClips].sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime - b.startTime;
      if (a.duration !== b.duration) return a.duration - b.duration;
      return a.id.localeCompare(b.id);
    });

    const slotEndTimes: number[] = [];
    for (const clip of sortedClips) {
      const clipEnd = clip.startTime + clip.duration;
      let slotIndex = slotEndTimes.findIndex(
        (endTime) => endTime <= clip.startTime + CLIP_INTERVAL_EPSILON
      );
      if (slotIndex === -1) {
        slotIndex = slotEndTimes.length;
        slotEndTimes.push(clipEnd);
      } else {
        slotEndTimes[slotIndex] = clipEnd;
      }
      assignments.set(clip.id, `${kind}:${sourceKey}:${slotIndex}`);
    }
  }

  return assignments;
}

/**
 * Manages a pool of video elements for frame extraction
 */
export function useVideoElements() {
  const { videoElementsRef, audioElementsRef } = useVideoRefs();
  const { clips } = useTimeline();
  const loadedVideoPoolKeysRef = useRef<Set<string>>(new Set());
  const loadedAudioPoolKeysRef = useRef<Set<string>>(new Set());
  const videoSourceByPoolKeyRef = useRef<Map<string, string>>(new Map());
  const audioSourceByPoolKeyRef = useRef<Map<string, string>>(new Map());
  const videoPoolRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioPoolRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const videoPoolKeyByClipIdRef = useRef<Map<string, string>>(new Map());
  const audioPoolKeyByClipIdRef = useRef<Map<string, string>>(new Map());

  // Create or get video element for a shared source/slot
  const getVideoElement = useCallback(
    (clipId: string): HTMLVideoElement | null => {
      const clipPoolKey = videoPoolKeyByClipIdRef.current.get(clipId) || clipId;
      let video = videoPoolRef.current.get(clipPoolKey);
      if (!video) {
        video = document.createElement("video");
        video.preload = "auto";
        video.muted = true; // Mute for autoplay policy
        video.playsInline = true;
        videoPoolRef.current.set(clipPoolKey, video);
      }
      if (videoElementsRef.current) {
        videoElementsRef.current.set(clipId, video);
      }
      return video;
    },
    [videoElementsRef]
  );

  // Create or get audio element for a shared source/slot
  const getAudioElement = useCallback(
    (clipId: string): HTMLAudioElement | null => {
      const clipPoolKey = audioPoolKeyByClipIdRef.current.get(clipId) || clipId;
      let audio = audioPoolRef.current.get(clipPoolKey);
      if (!audio) {
        audio = document.createElement("audio");
        audio.preload = "auto";
        audio.muted = true;
        audioPoolRef.current.set(clipPoolKey, audio);
      }
      if (audioElementsRef.current) {
        audioElementsRef.current.set(clipId, audio);
      }
      return audio;
    },
    [audioElementsRef]
  );

  // Sync media element pool to current clips while reusing shared source slots.
  const preloadVideos = useCallback(() => {
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");
    const audioClips = clips.filter((c): c is AudioClip => c.type === "audio");
    const videoAssignments = buildSharedPoolAssignments(videoClips, "video");
    const audioAssignments = buildSharedPoolAssignments(audioClips, "audio");
    const activeVideoClipIds = new Set<string>();
    const activeAudioClipIds = new Set<string>();
    const activeVideoPoolKeys = new Set<string>();
    const activeAudioPoolKeys = new Set<string>();

    for (const clip of videoClips) {
      activeVideoClipIds.add(clip.id);
      const poolKey = videoAssignments.get(clip.id) || `video:${clip.id}`;
      videoPoolKeyByClipIdRef.current.set(clip.id, poolKey);
      activeVideoPoolKeys.add(poolKey);

      const video = getVideoElement(clip.id);
      if (!video) continue;

      const prevSource = videoSourceByPoolKeyRef.current.get(poolKey);
      if (prevSource !== clip.sourceUrl) {
        video.pause();
        video.src = clip.sourceUrl;
        videoSourceByPoolKeyRef.current.set(poolKey, clip.sourceUrl);
        loadedVideoPoolKeysRef.current.delete(poolKey);
      }

      if (!loadedVideoPoolKeysRef.current.has(poolKey)) {
        video.load();
        loadedVideoPoolKeysRef.current.add(poolKey);
      }
    }

    for (const clip of audioClips) {
      activeAudioClipIds.add(clip.id);
      const poolKey = audioAssignments.get(clip.id) || `audio:${clip.id}`;
      audioPoolKeyByClipIdRef.current.set(clip.id, poolKey);
      activeAudioPoolKeys.add(poolKey);

      const audio = getAudioElement(clip.id);
      if (!audio) continue;

      const prevSource = audioSourceByPoolKeyRef.current.get(poolKey);
      if (prevSource !== clip.sourceUrl) {
        audio.pause();
        audio.src = clip.sourceUrl;
        audioSourceByPoolKeyRef.current.set(poolKey, clip.sourceUrl);
        loadedAudioPoolKeysRef.current.delete(poolKey);
      }

      if (!loadedAudioPoolKeysRef.current.has(poolKey)) {
        audio.load();
        loadedAudioPoolKeysRef.current.add(poolKey);
      }
    }

    if (videoElementsRef.current) {
      for (const clipId of [...videoElementsRef.current.keys()]) {
        if (activeVideoClipIds.has(clipId)) continue;
        videoElementsRef.current.delete(clipId);
        videoPoolKeyByClipIdRef.current.delete(clipId);
      }
    }

    if (audioElementsRef.current) {
      for (const clipId of [...audioElementsRef.current.keys()]) {
        if (activeAudioClipIds.has(clipId)) continue;
        audioElementsRef.current.delete(clipId);
        audioPoolKeyByClipIdRef.current.delete(clipId);
      }
    }

    for (const [poolKey, video] of videoPoolRef.current) {
      if (activeVideoPoolKeys.has(poolKey)) continue;
      video.pause();
      video.src = "";
      video.load();
      videoPoolRef.current.delete(poolKey);
      loadedVideoPoolKeysRef.current.delete(poolKey);
      videoSourceByPoolKeyRef.current.delete(poolKey);
    }

    for (const [poolKey, audio] of audioPoolRef.current) {
      if (activeAudioPoolKeys.has(poolKey)) continue;
      audio.pause();
      audio.src = "";
      audio.load();
      audioPoolRef.current.delete(poolKey);
      loadedAudioPoolKeysRef.current.delete(poolKey);
      audioSourceByPoolKeyRef.current.delete(poolKey);
    }

    if (videoElementsRef.current) {
      for (const clip of videoClips) {
        const video = getVideoElement(clip.id);
        if (video) {
          videoElementsRef.current.set(clip.id, video);
        }
      }
    }

    if (audioElementsRef.current) {
      for (const clip of audioClips) {
        const audio = getAudioElement(clip.id);
        if (audio) {
          audioElementsRef.current.set(clip.id, audio);
        }
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
      videoPoolRef.current.forEach((video) => {
        video.pause();
        video.src = "";
        video.load();
      });
      audioPoolRef.current.forEach((audio) => {
        audio.pause();
        audio.src = "";
        audio.load();
      });
      videoPoolRef.current.clear();
      audioPoolRef.current.clear();
      videoElementsRef.current?.clear();
      audioElementsRef.current?.clear();
      loadedVideoPoolKeysRef.current.clear();
      loadedAudioPoolKeysRef.current.clear();
      videoSourceByPoolKeyRef.current.clear();
      audioSourceByPoolKeyRef.current.clear();
      videoPoolKeyByClipIdRef.current.clear();
      audioPoolKeyByClipIdRef.current.clear();
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
