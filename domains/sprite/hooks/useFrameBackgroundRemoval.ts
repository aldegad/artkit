"use client";

import { useState, useCallback, Dispatch, SetStateAction } from "react";
import { SpriteFrame } from "../types";
import { removeBackground } from "../../../utils/backgroundRemoval";

// ============================================
// Types
// ============================================

interface UseFrameBackgroundRemovalOptions {
  frames: SpriteFrame[];
  selectedFrameId: number | null;
  setFrames: Dispatch<SetStateAction<SpriteFrame[]>>;
  pushHistory: () => void;
  translations: {
    backgroundRemovalFailed?: string;
    selectFrameForBgRemoval?: string;
    frameImageNotFound?: string;
  };
}

interface UseFrameBackgroundRemovalReturn {
  // State
  isRemovingBackground: boolean;
  bgRemovalProgress: number;
  bgRemovalStatus: string;
  // Handler
  handleRemoveBackground: () => Promise<void>;
}

// ============================================
// Hook Implementation
// ============================================

export function useFrameBackgroundRemoval(
  options: UseFrameBackgroundRemovalOptions
): UseFrameBackgroundRemovalReturn {
  const {
    frames,
    selectedFrameId,
    setFrames,
    pushHistory,
    translations: t,
  } = options;

  // State
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [bgRemovalProgress, setBgRemovalProgress] = useState(0);
  const [bgRemovalStatus, setBgRemovalStatus] = useState("");

  // Handler
  const handleRemoveBackground = useCallback(async () => {
    if (isRemovingBackground) return;

    // Get selected frame
    const selectedFrame = selectedFrameId !== null
      ? frames.find((f) => f.id === selectedFrameId)
      : null;

    if (!selectedFrame) {
      alert(t.selectFrameForBgRemoval || "Please select a frame to remove background.");
      return;
    }

    if (!selectedFrame.imageData) {
      alert(t.frameImageNotFound || "Frame image not found.");
      return;
    }

    setIsRemovingBackground(true);
    setBgRemovalProgress(0);
    setBgRemovalStatus("Initializing...");

    try {
      // Save current state to history
      pushHistory();

      // Process the frame's imageData
      const resultCanvas = await removeBackground(selectedFrame.imageData, (progress, status) => {
        setBgRemovalProgress(progress);
        setBgRemovalStatus(status);
      });

      // Convert result canvas to data URL
      const newImageData = resultCanvas.toDataURL("image/png");

      // Update the frame with new image data
      setFrames((prevFrames) =>
        prevFrames.map((frame) =>
          frame.id === selectedFrameId
            ? { ...frame, imageData: newImageData }
            : frame
        )
      );

      setBgRemovalStatus("Done!");
    } catch (error) {
      console.error("Background removal failed:", error);
      setBgRemovalStatus("Failed");
      alert(t.backgroundRemovalFailed || "Background removal failed. Please try again.");
    } finally {
      setIsRemovingBackground(false);
      // Clear status after a delay
      setTimeout(() => {
        setBgRemovalProgress(0);
        setBgRemovalStatus("");
      }, 2000);
    }
  }, [isRemovingBackground, frames, selectedFrameId, setFrames, pushHistory, t]);

  return {
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    handleRemoveBackground,
  };
}
