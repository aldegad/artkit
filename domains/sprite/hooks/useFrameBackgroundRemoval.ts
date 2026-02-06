"use client";

import { useState, useCallback, Dispatch, SetStateAction } from "react";
import { SpriteFrame } from "../types";
import { removeBackground } from "../../../utils/backgroundRemoval";

// ============================================
// Types
// ============================================

interface UseFrameBackgroundRemovalOptions {
  frames: SpriteFrame[];
  currentFrameIndex: number;
  setFrames: Dispatch<SetStateAction<SpriteFrame[]>>;
  pushHistory: () => void;
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
  handleRemoveBackground: (mode: "current" | "all") => Promise<void>;
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
    setFrames,
    pushHistory,
    translations: t,
  } = options;

  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [bgRemovalProgress, setBgRemovalProgress] = useState(0);
  const [bgRemovalStatus, setBgRemovalStatus] = useState("");

  const handleRemoveBackground = useCallback(async (mode: "current" | "all") => {
    if (isRemovingBackground) return;

    // Determine which frames to process
    const validFrames = frames.filter((f) => f.imageData);
    const framesToProcess: SpriteFrame[] = [];

    if (mode === "current") {
      const currentFrame = validFrames[currentFrameIndex];
      if (!currentFrame) {
        alert(t.selectFrameForBgRemoval || "No frame available.");
        return;
      }
      if (!currentFrame.imageData) {
        alert(t.frameImageNotFound || "Frame image not found.");
        return;
      }
      framesToProcess.push(currentFrame);
    } else {
      for (const frame of frames) {
        if (frame.imageData) {
          framesToProcess.push(frame);
        }
      }
      if (framesToProcess.length === 0) {
        alert(t.frameImageNotFound || "No frames with images found.");
        return;
      }
    }

    setIsRemovingBackground(true);
    setBgRemovalProgress(0);
    setBgRemovalStatus("Initializing...");

    try {
      pushHistory();

      const totalFrames = framesToProcess.length;
      const updatedFrameData = new Map<number, string>();

      for (let i = 0; i < totalFrames; i++) {
        const frame = framesToProcess[i];
        const frameLabel = totalFrames > 1
          ? `${t.processingFrameProgress || "Processing frames"} (${i + 1}/${totalFrames})`
          : "";

        const resultCanvas = await removeBackground(frame.imageData!, (progress, status) => {
          const overallProgress = ((i + progress / 100) / totalFrames) * 100;
          setBgRemovalProgress(overallProgress);
          setBgRemovalStatus(frameLabel ? `${frameLabel}: ${status}` : status);
        });

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
      alert(t.backgroundRemovalFailed || "Background removal failed. Please try again.");
    } finally {
      setIsRemovingBackground(false);
      setTimeout(() => {
        setBgRemovalProgress(0);
        setBgRemovalStatus("");
      }, 2000);
    }
  }, [isRemovingBackground, frames, currentFrameIndex, setFrames, pushHistory, t]);

  return {
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    handleRemoveBackground,
  };
}
