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
  VIDEO_TRANSFORM_SHORTCUTS,
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
  isTransformActive: boolean;
  handleStartTransformShortcut: () => void;
  handleApplyTransform: () => void;
  handleCancelTransform: () => void;
  handleNudgeTransform: (dx: number, dy: number) => boolean;

  // Mask
  activeMaskId: string | null;
  deselectMask: () => void;
  isEditingMask: boolean;
  endMaskEdit: () => void;
  adjustMaskBrushSize: (delta: number) => void;
  isSpacePanning: boolean;
  setIsSpacePanning: (panning: boolean) => void;

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
    isTransformActive,
    handleStartTransformShortcut,
    handleApplyTransform,
    handleCancelTransform,
    handleNudgeTransform,
    activeMaskId,
    deselectMask,
    isEditingMask,
    endMaskEdit,
    adjustMaskBrushSize,
    isSpacePanning,
    setIsSpacePanning,
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    const isPreviewScopeKeyEvent = (event: KeyboardEvent): boolean => {
      const previewRoot = document.querySelector<HTMLElement>("[data-video-preview-root]");
      if (!previewRoot) return false;
      const target = event.target;
      if (target && target instanceof Node && previewRoot.contains(target)) return true;
      const activeElement = document.activeElement;
      if (activeElement && previewRoot.contains(activeElement)) return true;
      return previewRoot.matches(":hover");
    };

    const BRUSH_SIZE_DECREASE_CODES: readonly string[] = ["BracketLeft", "Minus", "NumpadSubtract"];
    const BRUSH_SIZE_INCREASE_CODES: readonly string[] = ["BracketRight", "Equal", "NumpadAdd"];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKeyEvent(e)) return;
      if (e.defaultPrevented) return;

      if (e.code === PLAYBACK_SHORTCUTS.togglePlay && isPreviewScopeKeyEvent(e)) {
        e.preventDefault();
        if (!e.repeat) {
          setIsSpacePanning(true);
        }
        return;
      }

      if (
        toolMode === "mask" &&
        !hasCmdOrCtrl(e) &&
        !e.altKey &&
        (BRUSH_SIZE_DECREASE_CODES.includes(e.code) || BRUSH_SIZE_INCREASE_CODES.includes(e.code))
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (BRUSH_SIZE_DECREASE_CODES.includes(e.code)) {
          adjustMaskBrushSize(-step);
        } else {
          adjustMaskBrushSize(step);
        }
        return;
      }

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
        if (matchesShortcut(e, VIDEO_TRANSFORM_SHORTCUTS.enterTransform)) {
          e.preventDefault();
          handleStartTransformShortcut();
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
      if (toolMode === "transform" && isTransformActive) {
        let dx = 0;
        let dy = 0;
        if (e.code === "ArrowLeft") dx = -1;
        if (e.code === "ArrowRight") dx = 1;
        if (e.code === "ArrowUp") dy = -1;
        if (e.code === "ArrowDown") dy = 1;
        if (dx !== 0 || dy !== 0) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          handleNudgeTransform(dx * step, dy * step);
          return;
        }
      }

      if (e.code === PLAYBACK_SHORTCUTS.togglePlay) {
        e.preventDefault();
        if (!e.repeat) {
          togglePlay();
        }
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
        if (isTransformActive) {
          e.preventDefault();
          handleApplyTransform();
          return;
        }
        if (toolMode === "crop") {
          e.preventDefault();
          handleApplyCrop();
        }
        return;
      }
      if (e.code === VIDEO_CONTEXT_SHORTCUTS.cancel) {
        if (isTransformActive) {
          e.preventDefault();
          handleCancelTransform();
          return;
        }
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

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== PLAYBACK_SHORTCUTS.togglePlay) return;
      if (!isSpacePanning) return;
      e.preventDefault();
      setIsSpacePanning(false);
    };

    const handleBlur = () => {
      setIsSpacePanning(false);
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
    };
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
    adjustMaskBrushSize,
    isSpacePanning,
    setIsSpacePanning,
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
    isTransformActive,
    handleStartTransformShortcut,
    handleApplyTransform,
    handleCancelTransform,
    handleNudgeTransform,
  ]);
}
