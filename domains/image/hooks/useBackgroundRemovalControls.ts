"use client";

import { useCallback, useState, type RefObject } from "react";
import type { BackgroundRemovalQuality } from "@/shared/ai/backgroundRemoval";
import { readAISettings, updateAISettings } from "@/shared/ai/settings";
import type { CropArea, UnifiedLayer } from "../types";
import { useBackgroundRemoval } from "./useBackgroundRemoval";

interface UseBackgroundRemovalControlsOptions {
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  selection: CropArea | null;
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  saveToHistory: () => void;
  translations: {
    backgroundRemovalFailed?: string;
  };
}

export function useBackgroundRemovalControls(
  options: UseBackgroundRemovalControlsOptions
) {
  const {
    layers,
    activeLayerId,
    selection,
    layerCanvasesRef,
    saveToHistory,
    translations,
  } = options;

  const [bgRemovalQuality, setBgRemovalQuality] = useState<BackgroundRemovalQuality>(
    () => readAISettings().backgroundRemovalQuality
  );

  const handleBgRemovalQualityChange = useCallback((quality: BackgroundRemovalQuality) => {
    setBgRemovalQuality(quality);
    updateAISettings({ backgroundRemovalQuality: quality });
  }, []);

  const {
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    handleRemoveBackground,
  } = useBackgroundRemoval({
    layers,
    activeLayerId,
    selection,
    layerCanvasesRef,
    saveToHistory,
    quality: bgRemovalQuality,
    translations,
  });

  return {
    bgRemovalQuality,
    handleBgRemovalQualityChange,
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    handleRemoveBackground,
  };
}
