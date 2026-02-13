"use client";

import { useState, useCallback, Dispatch, SetStateAction } from "react";
import { SpriteFrame } from "../types";
import {
  removeBackground,
  type BackgroundRemovalModel,
  type BackgroundRemovalQuality,
} from "@/shared/ai/backgroundRemoval";
import { showErrorToast, showInfoToast } from "@/shared/components";

// ============================================
// Types
// ============================================

interface UseFrameBackgroundRemovalOptions {
  frames: SpriteFrame[];
  currentFrameIndex?: number;
  getCurrentFrameIndex?: () => number;
  selectedFrameIds: number[];
  setFrames: Dispatch<SetStateAction<SpriteFrame[]>>;
  pushHistory: () => void;
  quality?: BackgroundRemovalQuality;
  model?: BackgroundRemovalModel;
  translations: {
    backgroundRemovalFailed?: string;
    selectFrameForBgRemoval?: string;
    frameImageNotFound?: string;
    processingFrameProgress?: string;
  };
}

interface UseFrameBackgroundRemovalReturn {
  isRemovingBackground: boolean;
  bgRemovalProgress: number;
  bgRemovalStatus: string;
  handleRemoveBackground: (mode: "current" | "selected" | "all") => Promise<void>;
}

// ============================================
// Hook Implementation
// ============================================

export function useFrameBackgroundRemoval(
  options: UseFrameBackgroundRemovalOptions
): UseFrameBackgroundRemovalReturn {
  const {
    frames,
    currentFrameIndex,
    getCurrentFrameIndex,
    selectedFrameIds,
    setFrames,
    pushHistory,
    quality,
    model,
    translations: t,
  } = options;

  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [bgRemovalProgress, setBgRemovalProgress] = useState(0);
  const [bgRemovalStatus, setBgRemovalStatus] = useState("");

  const handleRemoveBackground = useCallback(async (mode: "current" | "selected" | "all") => {
    if (isRemovingBackground) return;

    // Determine which frames to process
    const framesToProcess: SpriteFrame[] = [];

    if (mode === "current") {
      const frameIndex = getCurrentFrameIndex ? getCurrentFrameIndex() : (currentFrameIndex ?? 0);
      const currentFrame = frames[frameIndex];
      if (!currentFrame?.imageData) {
        showInfoToast(t.selectFrameForBgRemoval || "No frame available.");
        return;
      }
      framesToProcess.push(currentFrame);
    } else if (mode === "selected") {
      const selectedSet = new Set(selectedFrameIds);
      for (const frame of frames) {
        if (selectedSet.has(frame.id) && frame.imageData) {
          framesToProcess.push(frame);
        }
      }
      if (framesToProcess.length === 0) {
        showInfoToast(t.selectFrameForBgRemoval || "No selected frames with images found.");
        return;
      }
    } else {
      for (const frame of frames) {
        if (frame.imageData) {
          framesToProcess.push(frame);
        }
      }
      if (framesToProcess.length === 0) {
        showInfoToast(t.frameImageNotFound || "No frames with images found.");
        return;
      }
    }

    setIsRemovingBackground(true);
    setBgRemovalProgress(0);
    setBgRemovalStatus("Initializing...");

    try {
      pushHistory();

      const backgroundRemovalOptions = (quality || model)
        ? {
            ...(quality ? { quality } : {}),
            ...(model ? { model } : {}),
          }
        : undefined;

      const totalFrames = framesToProcess.length;
      const updatedFrameData = new Map<number, string>();

      for (let i = 0; i < totalFrames; i++) {
        const frame = framesToProcess[i];
        const frameLabel = totalFrames > 1
          ? `${t.processingFrameProgress || "Processing frames"} (${i + 1}/${totalFrames})`
          : "";

        const resultCanvas = await removeBackground(
          frame.imageData!,
          (progress, status) => {
            const overallProgress = ((i + progress / 100) / totalFrames) * 100;
            setBgRemovalProgress(overallProgress);
            setBgRemovalStatus(frameLabel ? `${frameLabel}: ${status}` : status);
          },
          backgroundRemovalOptions,
        );

        updatedFrameData.set(frame.id, resultCanvas.toDataURL("image/png"));
      }

      setFrames((prevFrames) =>
        prevFrames.map((frame) => {
          const newImageData = updatedFrameData.get(frame.id);
          return newImageData ? { ...frame, imageData: newImageData } : frame;
        })
      );

      setBgRemovalStatus("Done!");
    } catch (error) {
      console.error("Background removal failed:", error);
      setBgRemovalStatus("Failed");
      showErrorToast(t.backgroundRemovalFailed || "Background removal failed. Please try again.");
    } finally {
      setIsRemovingBackground(false);
      setTimeout(() => {
        setBgRemovalProgress(0);
        setBgRemovalStatus("");
      }, 2000);
    }
  }, [isRemovingBackground, frames, currentFrameIndex, getCurrentFrameIndex, selectedFrameIds, setFrames, pushHistory, quality, model, t]);

  return {
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    handleRemoveBackground,
  };
}
