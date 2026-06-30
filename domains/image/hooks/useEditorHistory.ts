"use client";

import { useCallback } from "react";

interface UseEditorHistoryOptions {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  requestRender: () => void;
}

export function useEditorHistory(options: UseEditorHistoryOptions) {
  const { undo, redo, canUndo, canRedo, requestRender } = options;

  const handleUndo = useCallback(() => {
    undo();
    requestRender();
  }, [undo, requestRender]);

  const handleRedo = useCallback(() => {
    redo();
    requestRender();
  }, [redo, requestRender]);

  return {
    handleUndo,
    handleRedo,
    canUndoNow: canUndo(),
    canRedoNow: canRedo(),
  };
}
