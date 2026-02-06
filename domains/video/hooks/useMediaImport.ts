"use client";

import { useCallback } from "react";
import { useTimeline, useVideoState } from "../contexts";
import { SUPPORTED_VIDEO_FORMATS, SUPPORTED_IMAGE_FORMATS } from "../constants";
import { saveMediaBlob } from "../utils/mediaStorage";

export function useMediaImport() {
  const { tracks, clips, addTrack, addVideoClip, addImageClip } = useTimeline();
  const { project, setProject } = useVideoState();

  const importFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const hasExistingClips = clips.length > 0;

      for (const file of files) {
        const isVideo = SUPPORTED_VIDEO_FORMATS.some((format) =>
          file.type.startsWith(format.replace("/*", ""))
        );
        const isImage = SUPPORTED_IMAGE_FORMATS.some(
          (format) => file.type === format
        );

        // Use first track for initial import, create new track for additional media
        const trackId = hasExistingClips
          ? addTrack(undefined, "video")
          : tracks[0]?.id;
        if (!trackId) return;

        if (isVideo) {
          const url = URL.createObjectURL(file);
          const video = document.createElement("video");
          video.src = url;

          await new Promise<void>((resolve) => {
            video.onloadedmetadata = async () => {
              const mediaSize = {
                width: video.videoWidth,
                height: video.videoHeight,
              };

              const isFirstClip = !hasExistingClips;
              if (isFirstClip) {
                setProject({
                  ...project,
                  canvasSize: mediaSize,
                });
              }

              const clipId = addVideoClip(
                trackId,
                url,
                video.duration,
                mediaSize,
                0,
                isFirstClip ? mediaSize : undefined
              );

              try {
                await saveMediaBlob(clipId, file);
              } catch (error) {
                console.error("Failed to save media blob:", error);
              }

              resolve();
            };
            video.onerror = () => resolve();
          });
        } else if (isImage) {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.src = url;

          await new Promise<void>((resolve) => {
            img.onload = async () => {
              const mediaSize = {
                width: img.naturalWidth,
                height: img.naturalHeight,
              };

              const isFirstClip = !hasExistingClips;
              if (isFirstClip) {
                setProject({
                  ...project,
                  canvasSize: mediaSize,
                });
              }

              const clipId = addImageClip(
                trackId,
                url,
                mediaSize,
                0,
                5,
                isFirstClip ? mediaSize : undefined
              );

              try {
                await saveMediaBlob(clipId, file);
              } catch (error) {
                console.error("Failed to save media blob:", error);
              }

              resolve();
            };
            img.onerror = () => resolve();
          });
        }
      }
    },
    [tracks, clips, project, setProject, addTrack, addVideoClip, addImageClip]
  );

  return { importFiles };
}
