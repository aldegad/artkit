"use client";

import { useCallback } from "react";
import { Clip, VideoProject } from "../types";

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseVideoCropActionsOptions {
  cropArea: CropArea | null;
  lockCropAspect: boolean;
  clips: Clip[];
  project: VideoProject;
  setProject: (project: VideoProject) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  saveToHistory: () => void;
  setCropArea: (area: CropArea | null) => void;
  setCanvasExpandMode: (enabled: boolean) => void;
}

interface UseVideoCropActionsReturn {
  handleSelectAllCrop: () => void;
  handleClearCrop: () => void;
  handleCropWidthChange: (width: number) => void;
  handleCropHeightChange: (height: number) => void;
  handleExpandToSquare: () => void;
  handleFitToSquare: () => void;
  handleApplyCrop: () => void;
}

export function useVideoCropActions(
  options: UseVideoCropActionsOptions
): UseVideoCropActionsReturn {
  const {
    cropArea,
    lockCropAspect,
    clips,
    project,
    setProject,
    updateClip,
    saveToHistory,
    setCropArea,
    setCanvasExpandMode,
  } = options;

  const handleSelectAllCrop = useCallback(() => {
    setCropArea({
      x: 0,
      y: 0,
      width: project.canvasSize.width,
      height: project.canvasSize.height,
    });
  }, [project.canvasSize.height, project.canvasSize.width, setCropArea]);

  const handleClearCrop = useCallback(() => {
    setCropArea(null);
    setCanvasExpandMode(false);
  }, [setCanvasExpandMode, setCropArea]);

  const handleCropWidthChange = useCallback((newWidth: number) => {
    if (!cropArea) return;
    if (lockCropAspect && cropArea.width > 0) {
      const ratio = cropArea.height / cropArea.width;
      setCropArea({ ...cropArea, width: newWidth, height: Math.round(newWidth * ratio) });
    } else {
      setCropArea({ ...cropArea, width: newWidth });
    }
  }, [cropArea, lockCropAspect, setCropArea]);

  const handleCropHeightChange = useCallback((newHeight: number) => {
    if (!cropArea) return;
    if (lockCropAspect && cropArea.height > 0) {
      const ratio = cropArea.width / cropArea.height;
      setCropArea({ ...cropArea, height: newHeight, width: Math.round(newHeight * ratio) });
    } else {
      setCropArea({ ...cropArea, height: newHeight });
    }
  }, [cropArea, lockCropAspect, setCropArea]);

  const handleExpandToSquare = useCallback(() => {
    if (!cropArea) return;
    const maxSide = Math.max(cropArea.width, cropArea.height);
    setCropArea({ ...cropArea, width: maxSide, height: maxSide });
  }, [cropArea, setCropArea]);

  const handleFitToSquare = useCallback(() => {
    if (!cropArea) return;
    const minSide = Math.min(cropArea.width, cropArea.height);
    setCropArea({ ...cropArea, width: minSide, height: minSide });
  }, [cropArea, setCropArea]);

  const handleApplyCrop = useCallback(() => {
    if (!cropArea) return;

    const width = Math.max(1, Math.round(cropArea.width));
    const height = Math.max(1, Math.round(cropArea.height));
    if (width < 2 || height < 2) return;

    const offsetX = Math.round(cropArea.x);
    const offsetY = Math.round(cropArea.y);

    saveToHistory();

    for (const clip of clips) {
      if (clip.type === "audio") continue;
      updateClip(clip.id, {
        position: {
          x: clip.position.x - offsetX,
          y: clip.position.y - offsetY,
        },
      });
    }

    setProject({
      ...project,
      canvasSize: { width, height },
    });

    setCropArea(null);
    setCanvasExpandMode(false);
  }, [clips, cropArea, project, saveToHistory, setCanvasExpandMode, setCropArea, setProject, updateClip]);

  return {
    handleSelectAllCrop,
    handleClearCrop,
    handleCropWidthChange,
    handleCropHeightChange,
    handleExpandToSquare,
    handleFitToSquare,
    handleApplyCrop,
  };
}
