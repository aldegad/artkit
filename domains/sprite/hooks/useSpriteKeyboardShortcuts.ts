"use client";

import { useEffect } from "react";
import type { SpriteToolMode, FrameEditToolMode } from "../types";

interface UseSpriteKeyboardShortcutsOptions {
  setIsSpacePressed: (pressed: boolean) => void;
  setSpriteToolMode: (mode: SpriteToolMode) => void;
  setFrameEditToolMode: (mode: FrameEditToolMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  copyFrame: () => void;
  pasteFrame: () => void;
  saveProject: () => void;
  saveProjectAs: () => void;
}

export function useSpriteKeyboardShortcuts({
  setIsSpacePressed,
  setSpriteToolMode,
  setFrameEditToolMode,
  canUndo,
  canRedo,
  undo,
  redo,
  copyFrame,
  pasteFrame,
  saveProject,
  saveProjectAs,
}: UseSpriteKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const target = e.target as HTMLElement;
        const isInteractiveElement =
          target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;

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
        if (e.key === "v") setSpriteToolMode("select");
        if (e.key === "b") setFrameEditToolMode("brush");
        if (e.key === "e") setFrameEditToolMode("eraser");
        if (e.key === "i") setFrameEditToolMode("eyedropper");
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
    setFrameEditToolMode,
    canUndo,
    canRedo,
    undo,
    redo,
    copyFrame,
    pasteFrame,
    saveProject,
    saveProjectAs,
  ]);
}
