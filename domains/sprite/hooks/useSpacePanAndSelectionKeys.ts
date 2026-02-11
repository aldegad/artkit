"use client";

import { useEffect } from "react";

interface UseSpacePanAndSelectionKeysOptions {
  setIsPanning: (isPanning: boolean) => void;
  endPanDrag: () => void;
  hasSelection: () => boolean;
  onDeleteSelection: () => void;
  onClearSelection: () => void;
}

function isTextInputElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "SELECT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

export function useSpacePanAndSelectionKeys({
  setIsPanning,
  endPanDrag,
  hasSelection,
  onDeleteSelection,
  onClearSelection,
}: UseSpacePanAndSelectionKeysOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTextInput = isTextInputElement(e.target);

      if (e.code === "Space" && !e.repeat && !isTextInput) {
        e.preventDefault();
        setIsPanning(true);
      }

      if (!isTextInput && !e.repeat && (e.key === "Delete" || e.key === "Backspace")) {
        if (hasSelection()) {
          e.preventDefault();
          e.stopPropagation();
          onDeleteSelection();
        }
      }

      if (!isTextInput && e.key === "Escape" && hasSelection()) {
        e.preventDefault();
        onClearSelection();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsPanning(false);
        endPanDrag();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [endPanDrag, hasSelection, onClearSelection, onDeleteSelection, setIsPanning]);
}

