"use client";

import { useCallback, useState } from "react";
import type { SpriteFrame } from "../types";

interface UseSpritePreviewImportHandlersOptions {
  addTrack: (name?: string, frames?: SpriteFrame[]) => void;
  pushHistory: () => void;
  setPendingVideoFile: (file: File | null) => void;
  setIsVideoImportOpen: (open: boolean) => void;
}

interface UseSpritePreviewImportHandlersResult {
  isFileDragOver: boolean;
  handleFileDragOver: (e: React.DragEvent) => void;
  handleFileDragLeave: (e: React.DragEvent) => void;
  handleFileDrop: (e: React.DragEvent) => void;
  handleFileSelect: (files: File[]) => void;
}

export function useSpritePreviewImportHandlers(
  options: UseSpritePreviewImportHandlersOptions
): UseSpritePreviewImportHandlersResult {
  const { addTrack, pushHistory, setPendingVideoFile, setIsVideoImportOpen } = options;
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  const importImageFilesAsTrack = useCallback((imageFiles: File[]) => {
    if (imageFiles.length === 0) return;

    pushHistory();
    const loadPromises = imageFiles.map(
      (file) =>
        new Promise<{ imageData: string; name: string }>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve({
              imageData: event.target?.result as string,
              name: file.name.replace(/\.[^/.]+$/, ""),
            });
          };
          reader.readAsDataURL(file);
        })
    );

    void Promise.all(loadPromises).then((results) => {
      const newFrames = results.map((result, index) => ({
        id: Date.now() + index,
        points: [] as { x: number; y: number }[],
        name: result.name,
        imageData: result.imageData,
        offset: { x: 0, y: 0 },
      }));
      addTrack("Image Import", newFrames);
    });
  }, [addTrack, pushHistory]);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsFileDragOver(true);
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsFileDragOver(false);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsFileDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Check for video files
    const videoFile = files.find((file) => file.type.startsWith("video/"));
    if (videoFile) {
      setPendingVideoFile(videoFile);
      setIsVideoImportOpen(true);
      return;
    }

    // Handle image files -> create new track
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    importImageFilesAsTrack(imageFiles);
  }, [importImageFilesAsTrack, setPendingVideoFile, setIsVideoImportOpen]);

  // Handle file select from ImageDropZone (click-to-browse or drag-drop on empty state)
  const handleFileSelect = useCallback((files: File[]) => {
    if (files.length === 0) return;

    const videoFile = files.find((file) => file.type.startsWith("video/"));
    if (videoFile) {
      setPendingVideoFile(videoFile);
      setIsVideoImportOpen(true);
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    importImageFilesAsTrack(imageFiles);
  }, [importImageFilesAsTrack, setPendingVideoFile, setIsVideoImportOpen]);

  return {
    isFileDragOver,
    handleFileDragOver,
    handleFileDragLeave,
    handleFileDrop,
    handleFileSelect,
  };
}
