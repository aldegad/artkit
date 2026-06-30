"use client";

import { useCallback } from "react";
import type { SavedVideoProject } from "@/domains/video";
import { useSaveProjectDialog } from "@/shared/hooks";
import { collectProjectGroupNames } from "@/shared/utils/projectGroups";

interface SaveDetailsRequest {
  mode: "save" | "saveAs";
  name: string;
  projectGroup?: string;
}

export function useProjectSaveDetails(savedProjects: SavedVideoProject[]) {
  const {
    dialogState: saveDialogState,
    requestSaveDetails,
    closeDialog: closeSaveDialog,
    submitDialog: submitSaveDialog,
  } = useSaveProjectDialog();

  const requestProjectSaveDetails = useCallback((request: SaveDetailsRequest) => {
    return requestSaveDetails({
      ...request,
      existingProjectGroups: collectProjectGroupNames(savedProjects),
    });
  }, [requestSaveDetails, savedProjects]);

  return {
    saveDialogState,
    requestProjectSaveDetails,
    closeSaveDialog,
    submitSaveDialog,
  };
}
