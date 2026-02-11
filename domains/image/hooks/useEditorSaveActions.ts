"use client";

import { useState, useCallback, useEffect } from "react";
import { showErrorToast } from "@/shared/components";

interface UseEditorSaveActionsOptions {
  saveProject: () => Promise<void>;
  saveAsProject: () => Promise<void>;
  canSave: boolean;
  saveFailedMessage: string;
}

interface UseEditorSaveActionsReturn {
  saveCount: number;
  handleSaveProjectAction: () => Promise<void>;
  handleSaveAsProjectAction: () => Promise<void>;
}

export function useEditorSaveActions(
  options: UseEditorSaveActionsOptions
): UseEditorSaveActionsReturn {
  const { saveProject, saveAsProject, canSave, saveFailedMessage } = options;
  const [saveCount, setSaveCount] = useState(0);

  const handleSaveProjectAction = useCallback(async () => {
    await saveProject();
    setSaveCount((count) => count + 1);
  }, [saveProject]);

  const handleSaveAsProjectAction = useCallback(async () => {
    await saveAsProject();
    setSaveCount((count) => count + 1);
  }, [saveAsProject]);

  useEffect(() => {
    const handleSaveShortcut = async (e: KeyboardEvent) => {
      if (e.code !== "KeyS" || (!e.metaKey && !e.ctrlKey)) return;
      if (e.repeat) return;

      e.preventDefault();
      try {
        if (e.shiftKey) {
          await handleSaveAsProjectAction();
        } else if (canSave) {
          await handleSaveProjectAction();
        }
      } catch (error) {
        showErrorToast(`${saveFailedMessage}: ${(error as Error).message}`);
      }
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => {
      window.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [handleSaveProjectAction, handleSaveAsProjectAction, canSave, saveFailedMessage]);

  return {
    saveCount,
    handleSaveProjectAction,
    handleSaveAsProjectAction,
  };
}
