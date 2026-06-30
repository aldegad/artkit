"use client";

import { useCallback } from "react";
import type { SaveProjectDialogRequest } from "@/shared/hooks/useSaveProjectDialog";
import { collectProjectGroupNames } from "@/shared/utils/projectGroups";
import type { SavedImageProject } from "../types";

type ProjectSaveDetailsRequest = Omit<SaveProjectDialogRequest, "existingProjectGroups">;

interface UseProjectSaveDetailsOptions {
  requestSaveDetails: (
    request: SaveProjectDialogRequest
  ) => Promise<{ name: string; projectGroup: string } | null>;
  savedProjects: SavedImageProject[];
}

export function useProjectSaveDetails(options: UseProjectSaveDetailsOptions) {
  const { requestSaveDetails, savedProjects } = options;

  return useCallback((request: ProjectSaveDetailsRequest) => {
    return requestSaveDetails({
      ...request,
      existingProjectGroups: collectProjectGroupNames(savedProjects),
    });
  }, [requestSaveDetails, savedProjects]);
}
