"use client";

import { useState, useCallback, useEffect } from "react";
import { showErrorToast } from "@/shared/components";

interface UseEditorSaveActionsOptions {
  saveProject: () => Promise<boolean>;
  saveAsProject: () => Promise<boolean>;
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
    const saved = await saveProject();
    if (saved) {
      setSaveCount((count) => count + 1);
    }
  }, [saveProject]);

  const handleSaveAsProjectAction = useCallback(async () => {
    const saved = await saveAsProject();
    if (saved) {
      setSaveCount((count) => count + 1);
    }
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
