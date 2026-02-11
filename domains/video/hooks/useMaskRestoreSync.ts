"use client";

import { useEffect, useRef } from "react";
import type { MaskData, VideoProject } from "../types";

interface UseMaskRestoreSyncOptions {
  isAutosaveInitialized: boolean;
  projectMasks: MaskData[] | undefined;
  restoreMasks: (masks: MaskData[]) => void;
  masksMap: Map<string, MaskData>;
  selectedMaskIds: string[];
  selectMask: (maskId: string) => void;
  masksArray: MaskData[];
  setProject: (project: VideoProject) => void;
  projectRef: React.MutableRefObject<VideoProject>;
}

export function useMaskRestoreSync(options: UseMaskRestoreSyncOptions) {
  const {
    isAutosaveInitialized,
    projectMasks,
    restoreMasks,
    masksMap,
    selectedMaskIds,
    selectMask,
    masksArray,
    setProject,
    projectRef,
  } = options;

  // postRestorationRef prevents auto-start mask edit from firing during initial load.
  const masksRestoredRef = useRef(false);
  const postRestorationRef = useRef(false);

  useEffect(() => {
    if (!isAutosaveInitialized || masksRestoredRef.current) return;
    masksRestoredRef.current = true;
    if (projectMasks && projectMasks.length > 0) {
      restoreMasks(projectMasks);
    }
    // Allow auto-start mask edit only after masks are restored and rendered.
    const timer = setTimeout(() => {
      postRestorationRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [isAutosaveInitialized, projectMasks, restoreMasks]);

  // After autosave restore: sync selectedMaskIds -> MaskContext.activeMaskId
  // so that MaskControls shows when a mask was selected at save time.
  const maskSelectionSyncedRef = useRef(false);
  useEffect(() => {
    if (!masksRestoredRef.current || maskSelectionSyncedRef.current) return;
    if (masksMap.size > 0 && selectedMaskIds.length > 0) {
      maskSelectionSyncedRef.current = true;
      selectMask(selectedMaskIds[0]);
    }
  }, [masksMap, selectedMaskIds, selectMask]);

  // Sync MaskContext masks -> project.masks (MaskContext is the single source of truth).
  useEffect(() => {
    if (!masksRestoredRef.current) return;
    setProject({
      ...projectRef.current,
      masks: masksArray,
    });
  }, [masksArray, setProject, projectRef]);

  return { postRestorationRef };
}
