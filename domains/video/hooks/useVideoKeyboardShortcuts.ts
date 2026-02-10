"use client";

import { useEffect } from "react";
import { shouldIgnoreKeyEvent } from "@/shared/utils/keyboard";
import {
  hasCmdOrCtrl,
  matchesShortcut,
  matchesVideoToolShortcut,
  VIDEO_EDIT_SHORTCUTS,
  VIDEO_ZOOM_SHORTCUTS,
  PLAYBACK_SHORTCUTS,
  VIDEO_CONTEXT_SHORTCUTS,
} from "../constants";
import type { VideoToolMode } from "../types";

interface UseVideoKeyboardShortcutsOptions {
  // Playback
  togglePlay: () => void;
  stepForward: () => void;
  stepBackward: () => void;

  // Tools
  onToolModeChange: (mode: VideoToolMode) => void;
  toolMode: VideoToolMode;

  // Edit operations
  handleUndo: () => void;
  handleRedo: () => void;
  handleSave: () => void;
  handleOpen: () => void;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handleDelete: () => void;
  handleDuplicate: () => void;

  // Zoom
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleFitToScreen: () => void;

  // Context
  handleApplyCrop: () => void;

  // Mask
  activeMaskId: string | null;
  deselectMask: () => void;
  isEditingMask: boolean;
  endMaskEdit: () => void;

  enabled?: boolean;
}

export function useVideoKeyboardShortcuts(
  options: UseVideoKeyboardShortcutsOptions
): void {
  const {
    togglePlay,
    stepForward,
    stepBackward,
    onToolModeChange,
    toolMode,
    handleUndo,
    handleRedo,
    handleSave,
    handleOpen,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleDuplicate,
    handleZoomIn,
    handleZoomOut,
    handleFitToScreen,
    handleApplyCrop,
    activeMaskId,
    deselectMask,
    isEditingMask,
    endMaskEdit,
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKeyEvent(e)) return;
      if (e.defaultPrevented) return;

      // --- Modifier shortcuts (Cmd/Ctrl) ---
      if (hasCmdOrCtrl(e)) {
        if (e.repeat && matchesShortcut(e, VIDEO_EDIT_SHORTCUTS.save)) {
          e.preventDefault();
          return;
        }

        for (const redo of VIDEO_EDIT_SHORTCUTS.redo) {
          if (matchesShortcut(e, redo)) {
            e.preventDefault();
            handleRedo();
            return;
          }
        }
        if (matchesShortcut(e, VIDEO_EDIT_SHORTCUTS.undo)) {
          e.preventDefault();
          handleUndo();
          return;
        }
        if (matchesShortcut(e, VIDEO_EDIT_SHORTCUTS.save)) {
          e.preventDefault();
          handleSave();
          return;
        }
        if (matchesShortcut(e, VIDEO_EDIT_SHORTCUTS.open)) {
          e.preventDefault();
          handleOpen();
          return;
        }
        if (matchesShortcut(e, VIDEO_EDIT_SHORTCUTS.copy)) {
          e.preventDefault();
          handleCopy();
          return;
        }
        if (matchesShortcut(e, VIDEO_EDIT_SHORTCUTS.cut)) {
          e.preventDefault();
          handleCut();
          return;
        }
        if (matchesShortcut(e, VIDEO_EDIT_SHORTCUTS.paste)) {
          e.preventDefault();
          handlePaste();
          return;
        }
        if (matchesShortcut(e, VIDEO_ZOOM_SHORTCUTS.zoomIn)) {
          e.preventDefault();
          handleZoomIn();
          return;
        }
        if (matchesShortcut(e, VIDEO_ZOOM_SHORTCUTS.zoomOut)) {
          e.preventDefault();
          handleZoomOut();
          return;
        }
        if (matchesShortcut(e, VIDEO_ZOOM_SHORTCUTS.fitToScreen)) {
          e.preventDefault();
          handleFitToScreen();
          return;
        }
        return;
      }

      // --- Shift shortcuts ---
      if (matchesShortcut(e, VIDEO_EDIT_SHORTCUTS.duplicate)) {
        e.preventDefault();
        handleDuplicate();
        return;
      }

      // --- Tool shortcuts (single key, no modifiers) ---
      const matchedTool = matchesVideoToolShortcut(e);
      if (matchedTool) {
        onToolModeChange(matchedTool);
        return;
      }

      // --- Playback & context shortcuts (e.code based) ---
      if (e.code === PLAYBACK_SHORTCUTS.togglePlay) {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.code === PLAYBACK_SHORTCUTS.stepBackward) {
        stepBackward();
        return;
      }
      if (e.code === PLAYBACK_SHORTCUTS.stepForward) {
        stepForward();
        return;
      }
      if (e.code === VIDEO_CONTEXT_SHORTCUTS.applyCrop) {
        if (toolMode === "crop") {
          e.preventDefault();
          handleApplyCrop();
        }
        return;
      }
      if (e.code === VIDEO_CONTEXT_SHORTCUTS.cancel) {
        if (activeMaskId) deselectMask();
        if (isEditingMask) endMaskEdit();
        return;
      }
      if (VIDEO_CONTEXT_SHORTCUTS.delete.includes(e.code)) {
        e.preventDefault();
        handleDelete();
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    enabled,
    togglePlay,
    onToolModeChange,
    toolMode,
    handleApplyCrop,
    activeMaskId,
    deselectMask,
    isEditingMask,
    endMaskEdit,
    stepBackward,
    stepForward,
    handleUndo,
    handleRedo,
    handleSave,
    handleOpen,
    handleZoomIn,
    handleZoomOut,
    handleFitToScreen,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleDuplicate,
  ]);
}
