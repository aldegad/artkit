"use client";

import { useCallback, useState } from "react";
import { useTimeline, useVideoState } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { SUPPORTED_VIDEO_FORMATS, SUPPORTED_IMAGE_FORMATS } from "../../constants";

interface AssetDropZoneProps {
  className?: string;
}

export function AssetDropZone({ className }: AssetDropZoneProps) {
  const { tracks, clips, addVideoClip, addImageClip } = useTimeline();
  const { project, setProject } = useVideoState();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      // Get the first track or create one
      const trackId = tracks[0]?.id;
      if (!trackId) return;

      for (const file of files) {
        const isVideo = SUPPORTED_VIDEO_FORMATS.some((format) =>
          file.type.startsWith(format.replace("/*", ""))
        );
        const isImage = SUPPORTED_IMAGE_FORMATS.some((format) =>
          file.type === format
        );

        if (isVideo) {
          // Load video metadata
          const url = URL.createObjectURL(file);
          const video = document.createElement("video");
          video.src = url;

          await new Promise<void>((resolve) => {
            video.onloadedmetadata = () => {
              const mediaSize = { width: video.videoWidth, height: video.videoHeight };

              // Set canvas size to first imported media size
              if (clips.length === 0) {
                setProject({
                  ...project,
                  canvasSize: mediaSize,
                });
              }

              addVideoClip(
                trackId,
                url,
                video.duration,
                mediaSize,
                0
              );
              resolve();
            };
            video.onerror = () => resolve();
          });
        } else if (isImage) {
          // Load image metadata
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.src = url;

          await new Promise<void>((resolve) => {
            img.onload = () => {
              const mediaSize = { width: img.naturalWidth, height: img.naturalHeight };

              // Set canvas size to first imported media size
              if (clips.length === 0) {
                setProject({
                  ...project,
                  canvasSize: mediaSize,
                });
              }

              addImageClip(
                trackId,
                url,
                mediaSize,
                0,
                5 // Default 5 second duration for images
              );
              resolve();
            };
            img.onerror = () => resolve();
          });
        }
      }
    },
    [tracks, clips, project, setProject, addVideoClip, addImageClip]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      // Create a synthetic drop event
      const dataTransfer = new DataTransfer();
      Array.from(files).forEach((file) => dataTransfer.items.add(file));

      handleDrop({
        preventDefault: () => {},
        dataTransfer,
      } as unknown as React.DragEvent);

      // Reset input
      e.target.value = "";
    },
    [handleDrop]
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors",
        isDragOver
          ? "border-accent bg-accent/10"
          : "border-border hover:border-accent/50",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <svg
        className="w-12 h-12 text-text-tertiary mb-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M12 4v12m0 0l-4-4m4 4l4-4" />
        <path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
      </svg>

      <p className="text-text-secondary text-center mb-2">
        Drop video or image files here
      </p>
      <p className="text-text-tertiary text-sm text-center mb-4">
        Supports MP4, WebM, PNG, JPEG, GIF
      </p>

      <label className="cursor-pointer">
        <input
          type="file"
          className="hidden"
          accept={[...SUPPORTED_VIDEO_FORMATS, ...SUPPORTED_IMAGE_FORMATS].join(",")}
          multiple
          onChange={handleFileSelect}
        />
        <span className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded transition-colors">
          Browse Files
        </span>
      </label>
    </div>
  );
}
