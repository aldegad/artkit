"use client";

import { useCallback } from "react";
import { Clip } from "../types";
import { removeClipPositionKeyframeById } from "../utils/clipTransformKeyframes";

interface UseVideoEditActionsOptions {
  toolMode: string;
  isEditingMask: boolean;
  activeMaskId: string | null;
  selectedMaskCount: number;
  canUndoMask: boolean;
  canRedoMask: boolean;
  undoMask: () => void;
  redoMask: () => void;
  undo: () => void;
  redo: () => void;
  deselectAll: () => void;
  selectedPositionKeyframe: { keyframeId: string } | null;
  selectedPositionKeyframeClip: Clip | null;
  clearSelectedPositionKeyframe: () => void;
  saveToHistory: () => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
}

interface UseVideoEditActionsResult {
  handleUndo: () => void;
  handleRedo: () => void;
  handleDeleteSelectedPositionKeyframe: () => boolean;
}

export function useVideoEditActions(
  options: UseVideoEditActionsOptions
): UseVideoEditActionsResult {
  const {
    toolMode,
    isEditingMask,
    activeMaskId,
    selectedMaskCount,
    canUndoMask,
    canRedoMask,
    undoMask,
    redoMask,
    undo,
    redo,
    deselectAll,
    selectedPositionKeyframe,
    selectedPositionKeyframeClip,
    clearSelectedPositionKeyframe,
    saveToHistory,
    updateClip,
  } = options;

  const shouldUseMaskHistory = useCallback((): boolean => {
    return (
      toolMode === "mask"
      || isEditingMask
      || activeMaskId !== null
      || selectedMaskCount > 0
    );
  }, [toolMode, isEditingMask, activeMaskId, selectedMaskCount]);

  const handleUndo = useCallback(() => {
    if (canUndoMask && shouldUseMaskHistory()) {
      undoMask();
      return;
    }
    undo();
    deselectAll();
  }, [canUndoMask, shouldUseMaskHistory, undoMask, undo, deselectAll]);

  const handleRedo = useCallback(() => {
    if (canRedoMask && shouldUseMaskHistory()) {
      redoMask();
      return;
    }
    redo();
    deselectAll();
  }, [canRedoMask, shouldUseMaskHistory, redoMask, redo, deselectAll]);

  const handleDeleteSelectedPositionKeyframe = useCallback((): boolean => {
    if (!selectedPositionKeyframe) return false;
    if (!selectedPositionKeyframeClip) {
      clearSelectedPositionKeyframe();
      return true;
    }

    saveToHistory();
    const result = removeClipPositionKeyframeById(
      selectedPositionKeyframeClip,
      selectedPositionKeyframe.keyframeId
    );
    if (result.removed) {
      updateClip(selectedPositionKeyframeClip.id, result.updates);
    }
    clearSelectedPositionKeyframe();
    return result.removed;
  }, [
    selectedPositionKeyframe,
    selectedPositionKeyframeClip,
    clearSelectedPositionKeyframe,
    saveToHistory,
    updateClip,
  ]);

  return {
    handleUndo,
    handleRedo,
    handleDeleteSelectedPositionKeyframe,
  };
}
