"use client";

import { useEffect } from "react";
import type { SpriteToolMode } from "../types";

interface UseSpriteKeyboardShortcutsOptions {
  setIsSpacePressed: (pressed: boolean) => void;
  setSpriteToolMode: (mode: SpriteToolMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  copyFrame: () => void;
  pasteFrame: () => void;
  saveProject: () => void;
  saveProjectAs: () => void;
  toolMode: SpriteToolMode;
  brushSize: number;
  setBrushSize: (value: number) => void;
  magicWandTolerance: number;
  setMagicWandTolerance: (value: number) => void;
  applyCrop?: () => void;
  clearCrop?: () => void;
}

export function useSpriteKeyboardShortcuts({
  setIsSpacePressed,
  setSpriteToolMode,
  canUndo,
  canRedo,
  undo,
  redo,
  copyFrame,
  pasteFrame,
  saveProject,
  saveProjectAs,
  toolMode,
  brushSize,
  setBrushSize,
  magicWandTolerance,
  setMagicWandTolerance,
  applyCrop,
  clearCrop,
}: UseSpriteKeyboardShortcutsOptions) {
  useEffect(() => {
    const BRUSH_SIZE_MIN = 1;
    const BRUSH_SIZE_MAX = 200;
    const WAND_TOLERANCE_MIN = 0;
    const WAND_TOLERANCE_MAX = 255;
    const isDecreaseKey = (event: KeyboardEvent) =>
      event.code === "Minus" || event.code === "NumpadSubtract" || event.key === "-";
    const isIncreaseKey = (event: KeyboardEvent) =>
      event.code === "Equal"
      || event.code === "NumpadAdd"
      || event.key === "="
      || event.key === "+";

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInteractiveElement =
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.code === "Space" && !e.repeat) {
        if (isInteractiveElement) {
          return;
        }

        e.preventDefault();
        if (document.activeElement instanceof HTMLButtonElement) {
          document.activeElement.blur();
        }
        setIsSpacePressed(true);
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isInteractiveElement) {
          return;
        }

        if (isDecreaseKey(e) || isIncreaseKey(e)) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const delta = isIncreaseKey(e) ? step : -step;

          if (toolMode === "brush" || toolMode === "eraser") {
            setBrushSize(Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, brushSize + delta)));
          } else if (toolMode === "magicwand") {
            setMagicWandTolerance(
              Math.max(
                WAND_TOLERANCE_MIN,
                Math.min(WAND_TOLERANCE_MAX, magicWandTolerance + delta),
              ),
            );
          }
          return;
        }

        if (e.key === "v") setSpriteToolMode("select");
        if (e.key === "h") setSpriteToolMode("hand");
        if (e.key === "b") setSpriteToolMode("brush");
        if (e.key === "e") setSpriteToolMode("eraser");
        if (e.key === "w") setSpriteToolMode("magicwand");
        if (e.key === "i") setSpriteToolMode("eyedropper");
        if (e.key === "z") setSpriteToolMode("zoom");
        if (e.key === "r") setSpriteToolMode("crop");
      }

      if (toolMode === "crop" && e.key === "Enter" && !isInteractiveElement) {
        e.preventDefault();
        applyCrop?.();
      }

      if (toolMode === "crop" && e.key === "Escape" && !isInteractiveElement) {
        e.preventDefault();
        clearCrop?.();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        if (canRedo) redo();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (canRedo) redo();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !e.shiftKey) {
        e.preventDefault();
        copyFrame();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !e.shiftKey) {
        e.preventDefault();
        pasteFrame();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.repeat) return;
        if (e.shiftKey) {
          saveProjectAs();
        } else {
          saveProject();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [
    setIsSpacePressed,
    setSpriteToolMode,
    canUndo,
    canRedo,
    undo,
    redo,
    copyFrame,
    pasteFrame,
    saveProject,
    saveProjectAs,
    toolMode,
    brushSize,
    setBrushSize,
    magicWandTolerance,
    setMagicWandTolerance,
    applyCrop,
    clearCrop,
  ]);
}
