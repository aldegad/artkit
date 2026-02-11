"use client";

import { useCallback, useMemo } from "react";
import type { SpriteFrame } from "../types";

function advanceToEnabledFrame(
  frames: SpriteFrame[],
  currentFrameIndex: number,
  setCurrentFrameIndex: (index: number) => void,
  includeCurrent: boolean = false
) {
  if (!frames[currentFrameIndex]?.disabled) return;

  const next = frames.findIndex((frame, index) =>
    (includeCurrent ? index >= currentFrameIndex : index > currentFrameIndex) && !frame.disabled
  );
  if (next >= 0) {
    setCurrentFrameIndex(next);
    return;
  }

  const first = frames.findIndex((frame) => !frame.disabled);
  if (first >= 0) {
    setCurrentFrameIndex(first);
  }
}

interface UseFrameStripSkipActionsOptions {
  frames: SpriteFrame[];
  selectedFrameIds: number[];
  nthValue: number;
  keepCount: number;
  getCurrentFrameIndex: () => number;
  pushHistory: () => void;
  setFrames: (frames: SpriteFrame[] | ((prev: SpriteFrame[]) => SpriteFrame[])) => void;
  setCurrentFrameIndex: (index: number) => void;
  setSelectedFrameIds: (ids: number[]) => void;
  setSelectedFrameId: (id: number | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
}

interface UseFrameStripSkipActionsResult {
  disabledCount: number;
  toggleFrameDisabled: (frameId: number) => void;
  toggleSelectedFramesDisabled: () => void;
  applyNthSkip: () => void;
  clearAllDisabled: () => void;
  deleteDisabledFrames: () => void;
}

export function useFrameStripSkipActions(
  options: UseFrameStripSkipActionsOptions
): UseFrameStripSkipActionsResult {
  const {
    frames,
    selectedFrameIds,
    nthValue,
    keepCount,
    getCurrentFrameIndex,
    pushHistory,
    setFrames,
    setCurrentFrameIndex,
    setSelectedFrameIds,
    setSelectedFrameId,
    setIsPlaying,
  } = options;

  const disabledCount = useMemo(
    () => frames.filter((frame) => frame.disabled).length,
    [frames],
  );

  // Toggle disabled on a single frame
  const toggleFrameDisabled = useCallback((frameId: number) => {
    const currentFrameIndex = getCurrentFrameIndex();
    pushHistory();
    const newFrames = frames.map((frame) =>
      frame.id === frameId ? { ...frame, disabled: !frame.disabled } : frame,
    );
    setFrames(newFrames);
    advanceToEnabledFrame(newFrames, currentFrameIndex, setCurrentFrameIndex);
  }, [frames, getCurrentFrameIndex, pushHistory, setFrames, setCurrentFrameIndex]);

  // Toggle disabled on selected frames (batch)
  const toggleSelectedFramesDisabled = useCallback(() => {
    const currentFrameIndex = getCurrentFrameIndex();
    if (selectedFrameIds.length === 0) return;
    pushHistory();

    // If any selected frame is enabled, disable all; otherwise enable all
    const anyEnabled = frames.some(
      (frame) => selectedFrameIds.includes(frame.id) && !frame.disabled,
    );
    const newFrames = frames.map((frame) =>
      selectedFrameIds.includes(frame.id) ? { ...frame, disabled: anyEnabled } : frame,
    );
    setFrames(newFrames);
    advanceToEnabledFrame(newFrames, currentFrameIndex, setCurrentFrameIndex);
  }, [selectedFrameIds, frames, getCurrentFrameIndex, pushHistory, setFrames, setCurrentFrameIndex]);

  // Nth skip: keep M frames out of every N (e.g. keep 1/3, keep 2/4)
  const applyNthSkip = useCallback(() => {
    const currentFrameIndex = getCurrentFrameIndex();
    if (frames.length === 0 || nthValue < 2 || keepCount < 1 || keepCount >= nthValue) return;
    pushHistory();
    const startIndex = currentFrameIndex;
    const newFrames = frames.map((frame, index) => {
      const relativeIndex = index - startIndex;
      if (relativeIndex < 0) return frame; // keep frames before start unchanged
      const posInGroup = relativeIndex % nthValue;
      const shouldKeep = posInGroup < keepCount;
      return { ...frame, disabled: !shouldKeep };
    });
    setFrames(newFrames);
    advanceToEnabledFrame(newFrames, currentFrameIndex, setCurrentFrameIndex, true);
  }, [frames, getCurrentFrameIndex, nthValue, keepCount, pushHistory, setFrames, setCurrentFrameIndex]);

  // Clear all disabled states
  const clearAllDisabled = useCallback(() => {
    const hasDisabled = frames.some((frame) => frame.disabled);
    if (!hasDisabled) return;
    pushHistory();
    setFrames((prev) =>
      prev.map((frame) => (frame.disabled ? { ...frame, disabled: false } : frame)),
    );
  }, [frames, pushHistory, setFrames]);

  // Delete all disabled (skipped) frames
  const deleteDisabledFrames = useCallback(() => {
    const currentFrameIndex = getCurrentFrameIndex();
    if (disabledCount === 0) return;
    pushHistory();
    const newFrames = frames.filter((frame) => !frame.disabled);
    setFrames(newFrames);
    if (currentFrameIndex >= newFrames.length && newFrames.length > 0) {
      setCurrentFrameIndex(newFrames.length - 1);
    } else if (newFrames.length === 0) {
      setCurrentFrameIndex(0);
    }
    setSelectedFrameIds([]);
    setSelectedFrameId(null);
    setIsPlaying(false);
  }, [
    disabledCount,
    frames,
    getCurrentFrameIndex,
    pushHistory,
    setFrames,
    setCurrentFrameIndex,
    setSelectedFrameIds,
    setSelectedFrameId,
    setIsPlaying,
  ]);

  return {
    disabledCount,
    toggleFrameDisabled,
    toggleSelectedFramesDisabled,
    applyNthSkip,
    clearAllDisabled,
    deleteDisabledFrames,
  };
}
