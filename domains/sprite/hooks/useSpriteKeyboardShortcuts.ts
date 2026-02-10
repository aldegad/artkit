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
  applyCrop,
  clearCrop,
}: UseSpriteKeyboardShortcutsOptions) {
  useEffect(() => {
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

        if (e.key === "v") setSpriteToolMode("select");
        if (e.key === "h") setSpriteToolMode("hand");
        if (e.key === "b") setSpriteToolMode("brush");
        if (e.key === "e") setSpriteToolMode("eraser");
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
    applyCrop,
    clearCrop,
  ]);
}
