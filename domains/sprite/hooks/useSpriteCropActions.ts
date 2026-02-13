"use client";

import { useCallback, useEffect } from "react";
import { useSpriteTrackStore } from "../stores";
import type { Size, SpriteCropArea } from "../types";

interface UseSpriteCropActionsOptions {
  toolMode: string;
  cropArea: SpriteCropArea | null;
  cropBaseSize: Size | null;
  lockCropAspect: boolean;
  setCropArea: (cropArea: SpriteCropArea | null) => void;
  setCanvasExpandMode: (enabled: boolean) => void;
  setCanvasSize: (canvasSize: Size | null) => void;
  pushHistory: () => void;
}

interface UseSpriteCropActionsResult {
  handleSelectAllCrop: () => void;
  handleClearCrop: () => void;
  handleCropWidthChange: (newWidth: number) => void;
  handleCropHeightChange: (newHeight: number) => void;
  handleExpandToSquare: () => void;
  handleFitToSquare: () => void;
  handleApplyCrop: () => void;
}

export function useSpriteCropActions(
  options: UseSpriteCropActionsOptions
): UseSpriteCropActionsResult {
  const {
    toolMode,
    cropArea,
    cropBaseSize,
    lockCropAspect,
    setCropArea,
    setCanvasExpandMode,
    setCanvasSize,
    pushHistory,
  } = options;

  useEffect(() => {
    if (toolMode !== "crop") return;
    if (cropArea) return;
    if (!cropBaseSize) return;

    setCropArea({
      x: 0,
      y: 0,
      width: cropBaseSize.width,
      height: cropBaseSize.height,
    });
  }, [toolMode, cropArea, cropBaseSize, setCropArea]);

  const handleSelectAllCrop = useCallback(() => {
    if (!cropBaseSize) return;
    setCropArea({
      x: 0,
      y: 0,
      width: cropBaseSize.width,
      height: cropBaseSize.height,
    });
  }, [cropBaseSize, setCropArea]);

  const handleClearCrop = useCallback(() => {
    setCropArea(null);
    setCanvasExpandMode(false);
  }, [setCropArea, setCanvasExpandMode]);

  const handleCropWidthChange = useCallback((newWidth: number) => {
    if (!cropArea) return;
    const width = Math.max(10, Math.round(newWidth));
    if (lockCropAspect && cropArea.width > 0) {
      const ratio = cropArea.height / cropArea.width;
      setCropArea({
        ...cropArea,
        width,
        height: Math.max(10, Math.round(width * ratio)),
      });
      return;
    }
    setCropArea({ ...cropArea, width });
  }, [cropArea, lockCropAspect, setCropArea]);

  const handleCropHeightChange = useCallback((newHeight: number) => {
    if (!cropArea) return;
    const height = Math.max(10, Math.round(newHeight));
    if (lockCropAspect && cropArea.height > 0) {
      const ratio = cropArea.width / cropArea.height;
      setCropArea({
        ...cropArea,
        height,
        width: Math.max(10, Math.round(height * ratio)),
      });
      return;
    }
    setCropArea({ ...cropArea, height });
  }, [cropArea, lockCropAspect, setCropArea]);

  const handleExpandToSquare = useCallback(() => {
    if (!cropArea) return;
    const maxSide = Math.max(cropArea.width, cropArea.height);
    setCropArea({
      ...cropArea,
      width: Math.round(maxSide),
      height: Math.round(maxSide),
    });
  }, [cropArea, setCropArea]);

  const handleFitToSquare = useCallback(() => {
    if (!cropArea) return;
    const minSide = Math.min(cropArea.width, cropArea.height);
    setCropArea({
      ...cropArea,
      width: Math.round(minSide),
      height: Math.round(minSide),
    });
  }, [cropArea, setCropArea]);

  const handleApplyCrop = useCallback(() => {
    if (!cropArea) return;
    const width = Math.max(1, Math.round(cropArea.width));
    const height = Math.max(1, Math.round(cropArea.height));
    if (width < 2 || height < 2) return;

    const offsetX = Math.round(cropArea.x);
    const offsetY = Math.round(cropArea.y);

    pushHistory();
    useSpriteTrackStore.setState((state) => ({
      tracks: state.tracks.map((track) => ({
        ...track,
        canvasSize: { width, height },
        frames: track.frames.map((frame) => ({
          ...frame,
          offset: {
            x: (frame.offset?.x ?? 0) - offsetX,
            y: (frame.offset?.y ?? 0) - offsetY,
          },
        })),
      })),
      isPlaying: false,
    }));

    setCanvasSize({ width, height });
    setCropArea(null);
    setCanvasExpandMode(false);
  }, [cropArea, pushHistory, setCropArea, setCanvasExpandMode, setCanvasSize]);

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
