"use client";

import { useCallback, useRef, type RefObject } from "react";
import type { Size } from "@/shared/types";
import type { AspectRatio } from "@/shared/types/aspectRatio";
import type { PreviewViewportAPI } from "../contexts/VideoRefsContext";
import type { Clip, VideoToolMode } from "../types";

type CropArea = { x: number; y: number; width: number; height: number } | null;

interface UseVideoToolModeHandlersParams {
  toolMode: VideoToolMode;
  setToolMode: (mode: VideoToolMode) => void;
  selectedClipIds: string[];
  clips: Clip[];
  projectCanvasSize: Size;
  playbackCurrentTime: number;
  startMaskEdit: (trackId: string, canvasSize: Size, currentTime: number, clipStartTime?: number, clipDuration?: number) => string;
  isEditingMask: boolean;
  endMaskEdit: () => void;
  cropArea: CropArea;
  setCropArea: (area: CropArea) => void;
  previewViewportRef: RefObject<PreviewViewportAPI | null>;
}

interface UseVideoToolModeHandlersResult {
  tryStartMaskEditFromSelection: () => boolean;
  handleToolModeChange: (mode: VideoToolMode) => void;
  handleStartTransformShortcut: (hasSelectedVisualClip: boolean) => void;
  handleApplyTransform: () => void;
  handleCancelTransform: () => void;
  handleSetTransformAspectRatio: (ratio: AspectRatio) => void;
  handleNudgeTransform: (dx: number, dy: number) => boolean;
}

export function useVideoToolModeHandlers({
  toolMode,
  setToolMode,
  selectedClipIds,
  clips,
  projectCanvasSize,
  playbackCurrentTime,
  startMaskEdit,
  isEditingMask,
  endMaskEdit,
  cropArea,
  setCropArea,
  previewViewportRef,
}: UseVideoToolModeHandlersParams): UseVideoToolModeHandlersResult {
  const previousToolModeRef = useRef<VideoToolMode | null>(null);

  const tryStartMaskEditFromSelection = useCallback((): boolean => {
    if (selectedClipIds.length === 0) return false;
    const selected = clips.filter((clip) => selectedClipIds.includes(clip.id) && clip.type !== "audio");
    if (selected.length === 0) return false;

    const maskStart = Math.min(...selected.map((clip) => clip.startTime));
    const maskEnd = Math.max(...selected.map((clip) => clip.startTime + clip.duration));
    startMaskEdit(selected[0].trackId, projectCanvasSize, playbackCurrentTime, maskStart, maskEnd - maskStart);
    return true;
  }, [clips, playbackCurrentTime, projectCanvasSize, selectedClipIds, startMaskEdit]);

  const syncTransformToolModeMemory = useCallback((nextMode: VideoToolMode) => {
    if (nextMode === "transform" && toolMode !== "transform" && previousToolModeRef.current === null) {
      previousToolModeRef.current = toolMode;
      return;
    }
    if (nextMode !== "transform" && toolMode === "transform") {
      previousToolModeRef.current = null;
    }
  }, [toolMode]);

  const syncMaskEditingForToolMode = useCallback((nextMode: VideoToolMode) => {
    if (nextMode === "mask") {
      tryStartMaskEditFromSelection();
      return;
    }
    if (isEditingMask) {
      endMaskEdit();
    }
  }, [endMaskEdit, isEditingMask, tryStartMaskEditFromSelection]);

  const ensureCropAreaForToolMode = useCallback((nextMode: VideoToolMode) => {
    if (nextMode !== "crop" || cropArea) return;
    setCropArea({
      x: 0,
      y: 0,
      width: projectCanvasSize.width,
      height: projectCanvasSize.height,
    });
  }, [cropArea, projectCanvasSize.height, projectCanvasSize.width, setCropArea]);

  const handleToolModeChange = useCallback((mode: VideoToolMode) => {
    syncTransformToolModeMemory(mode);
    syncMaskEditingForToolMode(mode);
    ensureCropAreaForToolMode(mode);
    setToolMode(mode);
  }, [ensureCropAreaForToolMode, setToolMode, syncMaskEditingForToolMode, syncTransformToolModeMemory]);

  const restoreToolModeAfterTransform = useCallback(() => {
    if (previousToolModeRef.current) {
      setToolMode(previousToolModeRef.current);
      previousToolModeRef.current = null;
      return;
    }
    setToolMode("select");
  }, [setToolMode]);

  const handleStartTransformShortcut = useCallback((hasSelectedVisualClip: boolean) => {
    if (!hasSelectedVisualClip) return;
    if (toolMode !== "transform") {
      previousToolModeRef.current = toolMode;
      handleToolModeChange("transform");
      return;
    }
    previewViewportRef.current?.startTransformForSelection();
  }, [handleToolModeChange, previewViewportRef, toolMode]);

  const handleApplyTransform = useCallback(() => {
    previewViewportRef.current?.applyTransform();
    restoreToolModeAfterTransform();
  }, [previewViewportRef, restoreToolModeAfterTransform]);

  const handleCancelTransform = useCallback(() => {
    previewViewportRef.current?.cancelTransform();
    restoreToolModeAfterTransform();
  }, [previewViewportRef, restoreToolModeAfterTransform]);

  const handleSetTransformAspectRatio = useCallback((ratio: AspectRatio) => {
    previewViewportRef.current?.setTransformAspectRatio(ratio);
  }, [previewViewportRef]);

  const handleNudgeTransform = useCallback((dx: number, dy: number) => {
    return previewViewportRef.current?.nudgeTransform(dx, dy) ?? false;
  }, [previewViewportRef]);

  return {
    tryStartMaskEditFromSelection,
    handleToolModeChange,
    handleStartTransformShortcut,
    handleApplyTransform,
    handleCancelTransform,
    handleSetTransformAspectRatio,
    handleNudgeTransform,
  };
}
