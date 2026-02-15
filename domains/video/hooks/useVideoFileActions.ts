"use client";

import { useCallback, useState } from "react";
import { confirmDialog, showErrorToast } from "@/shared/components";
import { SavedVideoProject } from "../types";
import { clearVideoAutosave } from "../utils/videoAutosave";

interface UseVideoFileActionsOptions {
  newLabel?: string;
  newProjectConfirm?: string;
  cancelLabel?: string;
  projectName: string;
  projectGroup: string;
  saveProject: (options?: { name?: string; projectGroup?: string }) => Promise<void>;
  saveAsProject: (options?: { name?: string; projectGroup?: string }) => Promise<void>;
  requestSaveDetails: (request: {
    mode: "save" | "saveAs";
    name: string;
    projectGroup?: string;
  }) => Promise<{ name: string; projectGroup: string } | null>;
  openProjectList: () => void;
  loadProject: (projectMeta: SavedVideoProject) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  mediaFileInputRef: React.RefObject<HTMLInputElement | null>;
}

interface UseVideoFileActionsResult {
  saveCount: number;
  handleNew: () => Promise<void>;
  handleOpen: () => void;
  handleSave: () => Promise<void>;
  handleSaveAs: () => Promise<void>;
  handleLoadProject: (projectMeta: SavedVideoProject) => Promise<void>;
  handleDeleteProject: (id: string) => Promise<void>;
  handleImportMedia: () => void;
}

export function useVideoFileActions(
  options: UseVideoFileActionsOptions
): UseVideoFileActionsResult {
  const {
    newLabel,
    newProjectConfirm,
    cancelLabel,
    projectName,
    projectGroup,
    saveProject,
    saveAsProject,
    requestSaveDetails,
    openProjectList,
    loadProject,
    deleteProject,
    mediaFileInputRef,
  } = options;

  const [saveCount, setSaveCount] = useState(0);

  const handleNew = useCallback(async () => {
    const shouldCreate = await confirmDialog({
      title: newLabel || "New Project",
      message: newProjectConfirm || "Create a new project?",
      confirmLabel: newLabel || "New",
      cancelLabel: cancelLabel || "Cancel",
    });
    if (!shouldCreate) return;
    await clearVideoAutosave();
    window.location.reload();
  }, [cancelLabel, newLabel, newProjectConfirm]);

  const handleOpen = useCallback(() => {
    openProjectList();
  }, [openProjectList]);

  const runProjectSaveAction = useCallback(async (action: () => Promise<void>) => {
    try {
      await action();
      setSaveCount((count) => count + 1);
    } catch (error) {
      console.error("Failed to save project:", error);
      showErrorToast(`Save failed: ${(error as Error).message}`);
    }
  }, []);

  const handleSave = useCallback(async () => {
    const saveDetails = await requestSaveDetails({
      mode: "save",
      name: projectName || "Untitled Project",
      projectGroup,
    });
    if (!saveDetails) return;

    await runProjectSaveAction(() => saveProject(saveDetails));
  }, [projectGroup, projectName, requestSaveDetails, runProjectSaveAction, saveProject]);

  const handleSaveAs = useCallback(async () => {
    const saveDetails = await requestSaveDetails({
      mode: "saveAs",
      name: projectName || "Untitled Project",
      projectGroup,
    });
    if (!saveDetails) return;

    await runProjectSaveAction(() => saveAsProject(saveDetails));
  }, [projectGroup, projectName, requestSaveDetails, runProjectSaveAction, saveAsProject]);

  const handleLoadProject = useCallback(async (projectMeta: SavedVideoProject) => {
    await loadProject(projectMeta);
  }, [loadProject]);

  const handleDeleteProject = useCallback(async (id: string) => {
    await deleteProject(id);
  }, [deleteProject]);

  const handleImportMedia = useCallback(() => {
    mediaFileInputRef.current?.click();
  }, [mediaFileInputRef]);

  return {
    saveCount,
    handleNew,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleLoadProject,
    handleDeleteProject,
    handleImportMedia,
  };
}
