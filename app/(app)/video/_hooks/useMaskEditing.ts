"use client";

import { useCallback, useEffect, type RefObject } from "react";
import { MASK_BRUSH, type MaskBrushSettings, type VideoToolMode } from "@/domains/video";

interface UseMaskEditingOptions {
  toolMode: VideoToolMode;
  selectMasksForTimeline: (maskIds: string[]) => void;
  brushSettings: MaskBrushSettings;
  setBrushSize: (size: number) => void;
}

export function useMaskEditing(options: UseMaskEditingOptions) {
  const {
    toolMode,
    selectMasksForTimeline,
    brushSettings,
    setBrushSize,
  } = options;

  const clearSelectedMasks = useCallback(() => {
    selectMasksForTimeline([]);
  }, [selectMasksForTimeline]);

  const handleAdjustMaskBrushSize = useCallback((delta: number) => {
    if (toolMode !== "mask") return;
    const nextSize = Math.max(
      MASK_BRUSH.MIN_SIZE,
      Math.min(MASK_BRUSH.MAX_SIZE, brushSettings.size + delta),
    );
    if (nextSize === brushSettings.size) return;
    setBrushSize(nextSize);
  }, [toolMode, brushSettings.size, setBrushSize]);

  return {
    clearSelectedMasks,
    handleAdjustMaskBrushSize,
  };
}

interface UseMaskToolAutoSwitchOptions {
  toolMode: VideoToolMode;
  setToolMode: (mode: VideoToolMode) => void;
  isEditingMask: boolean;
}

export function useMaskToolAutoSwitch(options: UseMaskToolAutoSwitchOptions): void {
  const { toolMode, setToolMode, isEditingMask } = options;

  useEffect(() => {
    if (isEditingMask && toolMode !== "mask") {
      setToolMode("mask");
    }
  }, [isEditingMask, toolMode, setToolMode]);
}

interface UseMaskAutoStartFromSelectionOptions {
  toolMode: VideoToolMode;
  isEditingMask: boolean;
  postRestorationRef: RefObject<boolean>;
  tryStartMaskEditFromSelection: () => void;
}

export function useMaskAutoStartFromSelection(options: UseMaskAutoStartFromSelectionOptions): void {
  const {
    toolMode,
    isEditingMask,
    postRestorationRef,
    tryStartMaskEditFromSelection,
  } = options;

  useEffect(() => {
    if (!postRestorationRef.current) return;
    if (toolMode !== "mask") return;
    if (isEditingMask) return;
    tryStartMaskEditFromSelection();
  }, [toolMode, isEditingMask, tryStartMaskEditFromSelection, postRestorationRef]);
}
