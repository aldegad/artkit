"use client";

import { useCallback } from "react";
import { useTimeline, useVideoState } from "../contexts";
import {
  SUPPORTED_VIDEO_FORMATS,
  SUPPORTED_IMAGE_FORMATS,
  SUPPORTED_AUDIO_FORMATS,
} from "../constants";
import { saveMediaBlob } from "../utils/mediaStorage";

type MediaType = "video" | "image" | "audio";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogv", ".mov"] as const;
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"] as const;
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".oga"] as const;

function hasExtension(fileName: string, extensions: readonly string[]): boolean {
  const lowerName = fileName.toLowerCase();
  return extensions.some((ext) => lowerName.endsWith(ext));
}

function detectMediaType(file: File): MediaType | null {
  const mimeType = file.type.toLowerCase();

  if (
    mimeType.startsWith("video/") ||
    SUPPORTED_VIDEO_FORMATS.some((format) => mimeType === format) ||
    hasExtension(file.name, VIDEO_EXTENSIONS)
  ) {
    return "video";
  }

  if (
    mimeType.startsWith("image/") ||
    SUPPORTED_IMAGE_FORMATS.some((format) => mimeType === format) ||
    hasExtension(file.name, IMAGE_EXTENSIONS)
  ) {
    return "image";
  }

  if (
    mimeType.startsWith("audio/") ||
    SUPPORTED_AUDIO_FORMATS.some((format) => mimeType === format) ||
    hasExtension(file.name, AUDIO_EXTENSIONS)
  ) {
    return "audio";
  }

  return null;
}

export function useMediaImport() {
  const {
    tracks,
    clips,
    saveToHistory,
    addTrack,
    addVideoClip,
    addAudioClip,
    addImageClip,
  } = useTimeline();
  const { project, playback, setProject } = useVideoState();

  const importFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const supportedFiles = files.filter((file) => detectMediaType(file) !== null);
      if (supportedFiles.length === 0) return;

      saveToHistory();

      let targetVideoTrackId = tracks.find((track) => track.type === "video")?.id || null;
      let targetAudioTrackId = tracks.find((track) => track.type === "audio")?.id || null;
      const hasExistingVisualClip = clips.some((clip) => clip.type !== "audio");
      let insertTime = playback.currentTime;
      let visualImportedCount = 0;

      for (const file of supportedFiles) {
        const mediaType = detectMediaType(file);
        if (!mediaType) continue;

        if (mediaType === "video") {
          if (!targetVideoTrackId) {
            targetVideoTrackId = addTrack("Video 1", "video");
          }

          const url = URL.createObjectURL(file);
          const video = document.createElement("video");
          video.src = url;

          const metadata = await new Promise<{ duration: number; size: { width: number; height: number } } | null>((resolve) => {
            video.onloadedmetadata = () => {
              resolve({
                duration: Math.max(video.duration || 0, 0.1),
                size: {
                  width: video.videoWidth || project.canvasSize.width,
                  height: video.videoHeight || project.canvasSize.height,
                },
              });
            };
            video.onerror = () => resolve(null);
          });

          if (!metadata) {
            URL.revokeObjectURL(url);
            continue;
          }

          const isFirstVisual = !hasExistingVisualClip && visualImportedCount === 0;
          if (isFirstVisual) {
            setProject({
              ...project,
              canvasSize: metadata.size,
            });
          }

          const clipId = addVideoClip(
            targetVideoTrackId,
            url,
            metadata.duration,
            metadata.size,
            Math.max(0, insertTime),
            isFirstVisual ? metadata.size : undefined
          );

          try {
            await saveMediaBlob(clipId, file);
          } catch (error) {
            console.error("Failed to save media blob:", error);
          }

          insertTime += metadata.duration;
          visualImportedCount += 1;
          continue;
        }

        if (mediaType === "audio") {
          const url = URL.createObjectURL(file);
          const audio = document.createElement("audio");
          audio.src = url;

          const metadata = await new Promise<{ duration: number } | null>((resolve) => {
            audio.onloadedmetadata = () => {
              resolve({
                duration: Math.max(audio.duration || 0, 0.1),
              });
            };
            audio.onerror = () => resolve(null);
          });

          if (!metadata) {
            URL.revokeObjectURL(url);
            continue;
          }

          if (!targetAudioTrackId) {
            targetAudioTrackId = addTrack("Audio 1", "audio");
          }

          const clipId = addAudioClip(
            targetAudioTrackId,
            url,
            metadata.duration,
            Math.max(0, insertTime),
            { ...project.canvasSize }
          );

          try {
            await saveMediaBlob(clipId, file);
          } catch (error) {
            console.error("Failed to save media blob:", error);
          }

          insertTime += metadata.duration;
          continue;
        }

        if (!targetVideoTrackId) {
          targetVideoTrackId = addTrack("Video 1", "video");
        }

        if (mediaType === "image") {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.src = url;

          const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
            img.onload = () => {
              resolve({
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
            };
            img.onerror = () => resolve(null);
          });

          if (!size) {
            URL.revokeObjectURL(url);
            continue;
          }

          const isFirstVisual = !hasExistingVisualClip && visualImportedCount === 0;
          if (isFirstVisual) {
            setProject({
              ...project,
              canvasSize: size,
            });
          }

          const clipId = addImageClip(
            targetVideoTrackId,
            url,
            size,
            Math.max(0, insertTime),
            5,
            isFirstVisual ? size : undefined
          );

          try {
            await saveMediaBlob(clipId, file);
          } catch (error) {
            console.error("Failed to save media blob:", error);
          }

          insertTime += 5;
          visualImportedCount += 1;
        }
      }
    },
    [
      saveToHistory,
      tracks,
      clips,
      playback.currentTime,
      project,
      setProject,
      addTrack,
      addVideoClip,
      addAudioClip,
      addImageClip,
    ]
  );

  return { importFiles };
}
