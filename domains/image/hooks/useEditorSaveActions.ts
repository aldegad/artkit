"use client";

import { useState, useCallback, useEffect } from "react";
import { showErrorToast } from "@/shared/components";
import { trackEvent } from "@/shared/utils/analytics";

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
    try {
      const saved = await saveProject();
      if (saved) {
        setSaveCount((count) => count + 1);
        trackEvent("project_save", {
          tool: "image",
          save_mode: "save",
        });
      }
    } catch (error) {
      showErrorToast(`${saveFailedMessage}: ${(error as Error).message}`);
    }
  }, [saveProject, saveFailedMessage]);

  const handleSaveAsProjectAction = useCallback(async () => {
    try {
      const saved = await saveAsProject();
      if (saved) {
        setSaveCount((count) => count + 1);
        trackEvent("project_save", {
          tool: "image",
          save_mode: "save_as",
        });
      }
    } catch (error) {
      showErrorToast(`${saveFailedMessage}: ${(error as Error).message}`);
    }
  }, [saveAsProject, saveFailedMessage]);

  useEffect(() => {
    const handleSaveShortcut = async (e: KeyboardEvent) => {
      if (e.code !== "KeyS" || (!e.metaKey && !e.ctrlKey)) return;
      if (e.repeat) return;

      e.preventDefault();
      if (e.shiftKey) {
        await handleSaveAsProjectAction();
      } else if (canSave) {
        await handleSaveProjectAction();
      }
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => {
      window.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [handleSaveProjectAction, handleSaveAsProjectAction, canSave]);

  return {
    saveCount,
    handleSaveProjectAction,
    handleSaveAsProjectAction,
  };
}
