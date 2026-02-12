"use client";

import { useCallback, useEffect, useState } from "react";
import { User } from "firebase/auth";
import {
  hasLocalProjects,
  checkCloudProjects,
  uploadLocalProjectsToCloud,
  clearLocalProjects,
  clearCloudProjects,
} from "../services/projectStorage";

interface UseSpriteProjectSyncOptions {
  user: User | null;
  refreshProjects: () => Promise<void>;
}

interface UseSpriteProjectSyncResult {
  showSyncDialog: boolean;
  localProjectCount: number;
  cloudProjectCount: number;
  handleKeepCloud: () => Promise<void>;
  handleKeepLocal: () => Promise<void>;
  handleCancelSync: () => void;
}

export function useSpriteProjectSync(
  options: UseSpriteProjectSyncOptions
): UseSpriteProjectSyncResult {
  const { user, refreshProjects } = options;
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [localProjectCount, setLocalProjectCount] = useState(0);
  const [cloudProjectCount, setCloudProjectCount] = useState(0);

  // Check local/cloud conflicts when user logs in
  useEffect(() => {
    const checkSyncConflicts = async () => {
      if (!user) return;

      try {
        const hasLocal = await hasLocalProjects();
        const hasCloud = await checkCloudProjects(user.uid);

        if (hasLocal && hasCloud) {
          const localProjects = await (await import("@/shared/utils/storage")).getAllProjects();
          const cloudProjects = await (await import("@/shared/lib/firebase/firebaseSpriteStorage")).getAllSpriteProjectsFromFirebase(user.uid);

          setLocalProjectCount(localProjects.length);
          setCloudProjectCount(cloudProjects.length);
          setShowSyncDialog(true);
        } else if (hasLocal && !hasCloud) {
          await uploadLocalProjectsToCloud(user);
          await refreshProjects();
        }
      } catch (error) {
        console.error("Failed to check sync conflicts:", error);
      }
    };

    void checkSyncConflicts();
  }, [user, refreshProjects]);

  const handleKeepCloud = useCallback(async () => {
    await clearLocalProjects();
    setShowSyncDialog(false);
    await refreshProjects();
  }, [refreshProjects]);

  const handleKeepLocal = useCallback(async () => {
    if (user) {
      await clearCloudProjects(user);
      await uploadLocalProjectsToCloud(user);
      await refreshProjects();
    }
    setShowSyncDialog(false);
  }, [refreshProjects, user]);

  const handleCancelSync = useCallback(() => {
    setShowSyncDialog(false);
  }, []);

  return {
    showSyncDialog,
    localProjectCount,
    cloudProjectCount,
    handleKeepCloud,
    handleKeepLocal,
    handleCancelSync,
  };
}
