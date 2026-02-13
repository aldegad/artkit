"use client";

import { useCallback, useEffect } from "react";
import { useSpriteTrackStore } from "../stores";
import { showErrorToast } from "@/shared/components";
import type { Size, SpriteCropArea, SpriteCropScope } from "../types";

interface UseSpriteCropActionsOptions {
  toolMode: string;
  cropArea: SpriteCropArea | null;
  cropBaseSize: Size | null;
  cropScope: SpriteCropScope;
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
    cropScope,
    lockCropAspect,
    setCropArea,
    setCanvasExpandMode,
    setCanvasSize,
    pushHistory,
  } = options;

  const resolveScopeBaseSize = useCallback((): Size | null => {
    if (cropScope === "layer") {
      const state = useSpriteTrackStore.getState();
      const activeTrack = state.tracks.find((track) => track.id === state.activeTrackId);
      if (activeTrack?.canvasSize) {
        return {
          width: Math.max(1, Math.round(activeTrack.canvasSize.width)),
          height: Math.max(1, Math.round(activeTrack.canvasSize.height)),
        };
      }
    }

    return cropBaseSize;
  }, [cropBaseSize, cropScope]);

  useEffect(() => {
    if (toolMode !== "crop") return;
    if (cropArea) return;
    const baseSize = resolveScopeBaseSize();
    if (!baseSize) return;

    setCropArea({
      x: 0,
      y: 0,
      width: baseSize.width,
      height: baseSize.height,
    });
  }, [toolMode, cropArea, resolveScopeBaseSize, setCropArea]);

  const handleSelectAllCrop = useCallback(() => {
    const baseSize = resolveScopeBaseSize();
    if (!baseSize) return;
    setCropArea({
      x: 0,
      y: 0,
      width: baseSize.width,
      height: baseSize.height,
    });
  }, [resolveScopeBaseSize, setCropArea]);

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

  const applyCanvasCrop = useCallback((width: number, height: number, offsetX: number, offsetY: number) => {
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
  }, [pushHistory, setCanvasExpandMode, setCanvasSize, setCropArea]);

  const handleApplyCrop = useCallback(() => {
    if (!cropArea) return;
    const width = Math.max(1, Math.round(cropArea.width));
    const height = Math.max(1, Math.round(cropArea.height));
    if (width < 2 || height < 2) return;

    const offsetX = Math.round(cropArea.x);
    const offsetY = Math.round(cropArea.y);

    if (cropScope === "canvas") {
      applyCanvasCrop(width, height, offsetX, offsetY);
      return;
    }

    const { tracks, activeTrackId } = useSpriteTrackStore.getState();
    if (!activeTrackId) return;
    const activeTrack = tracks.find((track) => track.id === activeTrackId);
    if (!activeTrack) return;

    const imageCache = new Map<string, Promise<HTMLImageElement>>();
    const loadImage = (src: string): Promise<HTMLImageElement> => {
      const cached = imageCache.get(src);
      if (cached) return cached;

      const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load frame image"));
        img.src = src;
      });
      imageCache.set(src, promise);
      return promise;
    };

    const cropLayerOnly = async () => {
      const croppedFrames = await Promise.all(
        activeTrack.frames.map(async (frame) => {
          const nextOffset = { x: offsetX, y: offsetY };
          if (!frame.imageData) {
            return {
              ...frame,
              offset: nextOffset,
            };
          }

          try {
            const image = await loadImage(frame.imageData);
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              return {
                ...frame,
                offset: nextOffset,
              };
            }

            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(
              image,
              (frame.offset?.x ?? 0) - offsetX,
              (frame.offset?.y ?? 0) - offsetY,
            );

            return {
              ...frame,
              imageData: canvas.toDataURL("image/png"),
              offset: nextOffset,
              points: [
                { x: offsetX, y: offsetY },
                { x: offsetX + width, y: offsetY },
                { x: offsetX + width, y: offsetY + height },
                { x: offsetX, y: offsetY + height },
              ],
            };
          } catch (error) {
            console.error("Failed to crop layer frame image:", error);
            return {
              ...frame,
              offset: nextOffset,
            };
          }
        }),
      );

      pushHistory();
      useSpriteTrackStore.setState((state) => ({
        tracks: state.tracks.map((track) =>
          track.id === activeTrackId
            ? {
                ...track,
                canvasSize: { width, height },
                frames: croppedFrames,
              }
            : track,
        ),
        isPlaying: false,
      }));

      setCropArea(null);
      setCanvasExpandMode(false);
    };

    void cropLayerOnly().catch((error) => {
      console.error("Failed to apply layer crop:", error);
      showErrorToast((error as Error).message || "레이어 크롭에 실패했습니다.");
    });
  }, [
    applyCanvasCrop,
    cropArea,
    cropScope,
    pushHistory,
    setCanvasExpandMode,
    setCropArea,
  ]);

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
