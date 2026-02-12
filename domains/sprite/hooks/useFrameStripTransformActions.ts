"use client";

import { useCallback, useState } from "react";
import type { SpriteFrame } from "../types";
import { flipFrameImageData, type FrameFlipDirection } from "../utils/frameUtils";

interface UseFrameStripTransformActionsOptions {
  frames: SpriteFrame[];
  selectedFrameIds: number[];
  getCurrentFrameIndex: () => number;
  pushHistory: () => void;
  setFrames: (frames: SpriteFrame[] | ((prev: SpriteFrame[]) => SpriteFrame[])) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentFrameIndex: (index: number) => void;
}

interface UseFrameStripTransformActionsResult {
  isFlippingFrames: boolean;
  flipSelectedFrames: (direction: FrameFlipDirection) => Promise<void>;
  reverseSelectedFrames: () => void;
}

export function useFrameStripTransformActions(
  options: UseFrameStripTransformActionsOptions
): UseFrameStripTransformActionsResult {
  const {
    frames,
    selectedFrameIds,
    getCurrentFrameIndex,
    pushHistory,
    setFrames,
    setIsPlaying,
    setCurrentFrameIndex,
  } = options;
  const [isFlippingFrames, setIsFlippingFrames] = useState(false);

  const flipSelectedFrames = useCallback(async (direction: FrameFlipDirection) => {
    if (isFlippingFrames || selectedFrameIds.length === 0) return;

    const selectedSet = new Set(selectedFrameIds);
    const framesToFlip = frames.filter(
      (frame) => selectedSet.has(frame.id) && Boolean(frame.imageData),
    );

    if (framesToFlip.length === 0) return;

    setIsFlippingFrames(true);
    try {
      const flippedResults = await Promise.all(
        framesToFlip.map(async (frame) => {
          try {
            const flippedImageData = await flipFrameImageData(frame.imageData!, direction);
            return { id: frame.id, imageData: flippedImageData };
          } catch (error) {
            console.error(`Failed to flip frame ${frame.id}`, error);
            return null;
          }
        }),
      );

      const flippedById = new Map<number, string>();
      for (const result of flippedResults) {
        if (result) {
          flippedById.set(result.id, result.imageData);
        }
      }

      if (flippedById.size === 0) return;

      pushHistory();
      setIsPlaying(false);
      setFrames((prev) =>
        prev.map((frame) => {
          const flippedImageData = flippedById.get(frame.id);
          return flippedImageData ? { ...frame, imageData: flippedImageData } : frame;
        }),
      );
    } finally {
      setIsFlippingFrames(false);
    }
  }, [frames, isFlippingFrames, pushHistory, selectedFrameIds, setFrames, setIsPlaying]);

  const reverseSelectedFrames = useCallback(() => {
    if (selectedFrameIds.length < 2) return;

    const selectedSet = new Set(selectedFrameIds);
    const selectedFrames = frames.filter((frame) => selectedSet.has(frame.id));
    if (selectedFrames.length < 2) return;

    const currentFrameIndex = getCurrentFrameIndex();
    const currentFrameId = frames[currentFrameIndex]?.id ?? null;
    const reversedSelectedFrames = [...selectedFrames].reverse();
    let reverseIndex = 0;

    pushHistory();
    setIsPlaying(false);
    const newFrames = frames.map((frame) =>
      selectedSet.has(frame.id) ? reversedSelectedFrames[reverseIndex++] : frame,
    );
    setFrames(newFrames);

    if (currentFrameId !== null) {
      const nextCurrentFrameIndex = newFrames.findIndex((frame) => frame.id === currentFrameId);
      if (nextCurrentFrameIndex >= 0) {
        setCurrentFrameIndex(nextCurrentFrameIndex);
      }
    }
  }, [
    selectedFrameIds,
    frames,
    getCurrentFrameIndex,
    pushHistory,
    setIsPlaying,
    setFrames,
    setCurrentFrameIndex,
  ]);

  return {
    isFlippingFrames,
    flipSelectedFrames,
    reverseSelectedFrames,
  };
}
