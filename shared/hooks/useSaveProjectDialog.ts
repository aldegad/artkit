"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_PROJECT_GROUP,
  normalizeProjectGroupName,
} from "@/shared/utils/projectGroups";
import type { SaveProjectModalValue } from "@/shared/components/SaveProjectModal";

export interface SaveProjectDialogRequest {
  mode: "save" | "saveAs";
  name: string;
  projectGroup?: string;
  existingProjectGroups: string[];
}

export interface SaveProjectDialogState {
  isOpen: boolean;
  mode: "save" | "saveAs";
  initialName: string;
  initialProjectGroup: string;
  existingProjectGroups: string[];
}

const INITIAL_STATE: SaveProjectDialogState = {
  isOpen: false,
  mode: "save",
  initialName: "",
  initialProjectGroup: DEFAULT_PROJECT_GROUP,
  existingProjectGroups: [DEFAULT_PROJECT_GROUP],
};

export function useSaveProjectDialog() {
  const [dialogState, setDialogState] = useState<SaveProjectDialogState>(INITIAL_STATE);
  const resolverRef = useRef<((value: SaveProjectModalValue | null) => void) | null>(null);

  const closeDialog = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(null);
      resolverRef.current = null;
    }
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const submitDialog = useCallback((value: SaveProjectModalValue) => {
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const requestSaveDetails = useCallback((request: SaveProjectDialogRequest) => {
    return new Promise<SaveProjectModalValue | null>((resolve) => {
      if (resolverRef.current) {
        resolve(null);
        return;
      }

      resolverRef.current = resolve;
      setDialogState({
        isOpen: true,
        mode: request.mode,
        initialName: request.name,
        initialProjectGroup: normalizeProjectGroupName(request.projectGroup),
        existingProjectGroups: request.existingProjectGroups,
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (resolverRef.current) {
        resolverRef.current(null);
        resolverRef.current = null;
      }
    };
  }, []);

  return {
    dialogState,
    requestSaveDetails,
    closeDialog,
    submitDialog,
  };
}
