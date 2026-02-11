"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { confirmDialog, showErrorToast } from "@/shared/components";
import {
  Clip,
  INITIAL_TIMELINE_VIEW,
  MaskData,
  SavedVideoProject,
  TimelineViewState,
  VideoProject,
  VideoTrack,
  VideoToolMode,
} from "../types";
import { VideoStorageInfo, VideoStorageProvider } from "../services/videoProjectStorage";
import { type SaveLoadProgress } from "@/shared/lib/firebase/firebaseVideoStorage";
import { loadMediaBlob } from "../utils/mediaStorage";
import { saveVideoAutosave } from "../utils/videoAutosave";
import { normalizeClipTransformKeyframes } from "../utils/clipTransformKeyframes";
import { TIMELINE } from "../constants";

interface UseVideoProjectLibraryOptions {
  storageProvider: VideoStorageProvider;
  deleteConfirmLabel?: string;
  setProjectName: (name: string) => void;
  setProject: (project: VideoProject) => void;
  restoreTracks: (tracks: VideoTrack[]) => void;
  restoreClips: (clips: Clip[]) => void;
  restoreMasks: (masks: MaskData[]) => void;
  setViewState: (next: TimelineViewState) => void;
  seek: (time: number) => void;
  setLoopRange: (start: number, end: number, enableLoop?: boolean, durationHint?: number) => void;
  toolMode: VideoToolMode;
  autoKeyframeEnabled: boolean;
  selectClips: (clipIds: string[]) => void;
  clearHistory: () => void;
  clearMaskHistory: () => void;
}

interface UseVideoProjectLibraryReturn {
  currentProjectId: string | null;
  setCurrentProjectId: Dispatch<SetStateAction<string | null>>;
  savedProjects: SavedVideoProject[];
  setSavedProjects: Dispatch<SetStateAction<SavedVideoProject[]>>;
  storageInfo: VideoStorageInfo;
  setStorageInfo: Dispatch<SetStateAction<VideoStorageInfo>>;
  isProjectListOpen: boolean;
  setIsProjectListOpen: Dispatch<SetStateAction<boolean>>;
  isLoadingProject: boolean;
  loadProgress: SaveLoadProgress | null;
  projectListOperation: "load" | "delete" | null;
  openProjectList: () => void;
  loadProject: (projectMeta: SavedVideoProject) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
}

function calculateProjectDuration(clips: Clip[]): number {
  const maxEnd = clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
  return Math.max(maxEnd, 10);
}

function normalizeLoadedClip(clip: Clip): Clip {
  const baseScale = typeof clip.scale === "number" ? clip.scale : 1;
  const scaleX = typeof clip.scaleX === "number" ? clip.scaleX : 1;
  const scaleY = typeof clip.scaleY === "number" ? clip.scaleY : 1;
  const transformKeyframes = normalizeClipTransformKeyframes(clip);

  if (clip.type === "video") {
    return {
      ...clip,
      scale: baseScale,
      scaleX,
      scaleY,
      transformKeyframes,
      hasAudio: clip.hasAudio ?? true,
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  if (clip.type === "audio") {
    return {
      ...clip,
      scale: baseScale,
      scaleX,
      scaleY,
      transformKeyframes,
      sourceSize: clip.sourceSize || { width: 0, height: 0 },
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  return {
    ...clip,
    scale: baseScale,
    scaleX,
    scaleY,
    transformKeyframes,
  };
}

function sanitizeTimelineView(viewState: TimelineViewState | undefined): TimelineViewState {
  const base = viewState || INITIAL_TIMELINE_VIEW;
  const zoom = Number.isFinite(base.zoom) ? base.zoom : INITIAL_TIMELINE_VIEW.zoom;
  const scrollX = Number.isFinite(base.scrollX) ? base.scrollX : 0;
  const scrollY = Number.isFinite(base.scrollY) ? base.scrollY : 0;
  return {
    ...INITIAL_TIMELINE_VIEW,
    ...base,
    zoom: Math.max(TIMELINE.MIN_ZOOM, Math.min(TIMELINE.MAX_ZOOM, zoom)),
    scrollX: Math.max(0, scrollX),
    scrollY: Math.max(0, scrollY),
  };
}

function buildClipIdsBySourceId(clips: Clip[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const clip of clips) {
    if (!clip.sourceId) continue;
    const ids = result.get(clip.sourceId) || [];
    ids.push(clip.id);
    result.set(clip.sourceId, ids);
  }
  return result;
}

async function restoreClipsWithLocalMedia(normalizedClips: Clip[]): Promise<Clip[]> {
  const clipIdsBySourceId = buildClipIdsBySourceId(normalizedClips);
  const sourceBlobCache = new Map<string, Blob>();
  const restoredClips: Clip[] = [];

  for (const clip of normalizedClips) {
    let blob = await loadMediaBlob(clip.id);
    if (!blob && clip.sourceId) {
      blob = sourceBlobCache.get(clip.sourceId) || null;
      if (!blob) {
        const candidateIds = clipIdsBySourceId.get(clip.sourceId) || [];
        for (const candidateId of candidateIds) {
          if (candidateId === clip.id) continue;
          const candidateBlob = await loadMediaBlob(candidateId);
          if (candidateBlob) {
            blob = candidateBlob;
            sourceBlobCache.set(clip.sourceId, candidateBlob);
            break;
          }
        }
      }
    }

    if (blob) {
      if (clip.sourceId && !sourceBlobCache.has(clip.sourceId)) {
        sourceBlobCache.set(clip.sourceId, blob);
      }
      const newUrl = URL.createObjectURL(blob);
      restoredClips.push({ ...clip, sourceUrl: newUrl });
      continue;
    }

    // Skip stale blob: URLs that cannot be restored.
    if (!clip.sourceUrl.startsWith("blob:")) {
      restoredClips.push(clip);
    }
  }

  return restoredClips;
}

interface NormalizedLoadedPlayback {
  timelineView: TimelineViewState;
  persistedCurrentTime: number;
  duration: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  playbackRange: SavedVideoProject["playbackRange"];
}

function normalizeLoadedPlayback(
  loaded: SavedVideoProject,
  loadedDuration: number,
): NormalizedLoadedPlayback {
  const timelineView = sanitizeTimelineView(loaded.timelineView);
  const restoredTime = Math.max(0, Number.isFinite(loaded.currentTime) ? loaded.currentTime : 0);
  const duration = Math.max(loadedDuration, 0.001);

  const loop = loaded.playbackRange?.loop ?? false;
  const loopStart = Math.max(0, Math.min(loaded.playbackRange?.loopStart ?? 0, duration));
  const loopEnd = Math.max(
    loopStart + 0.001,
    Math.min(loaded.playbackRange?.loopEnd ?? duration, duration),
  );

  const persistedCurrentTime = loop
    ? Math.max(loopStart, Math.min(restoredTime, loopEnd))
    : Math.max(0, Math.min(restoredTime, duration));

  const shouldPersistPlaybackRange =
    loop || loopStart > 0.001 || loopEnd < duration - 0.001;
  const playbackRange = shouldPersistPlaybackRange
    ? {
        loop,
        loopStart,
        loopEnd,
      }
    : undefined;

  return {
    timelineView,
    persistedCurrentTime,
    duration,
    loop,
    loopStart,
    loopEnd,
    playbackRange,
  };
}

export function useVideoProjectLibrary(
  options: UseVideoProjectLibraryOptions
): UseVideoProjectLibraryReturn {
  const {
    storageProvider,
    deleteConfirmLabel,
    setProjectName,
    setProject,
    restoreTracks,
    restoreClips,
    restoreMasks,
    setViewState,
    seek,
    setLoopRange,
    toolMode,
    autoKeyframeEnabled,
    selectClips,
    clearHistory,
    clearMaskHistory,
  } = options;

  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedVideoProject[]>([]);
  const [storageInfo, setStorageInfo] = useState<VideoStorageInfo>({ used: 0, quota: 0, percentage: 0 });
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [loadProgress, setLoadProgress] = useState<SaveLoadProgress | null>(null);
  const [projectListOperation, setProjectListOperation] = useState<"load" | "delete" | null>(null);

  useEffect(() => {
    storageProvider.getAllProjects().then(setSavedProjects).catch(console.error);
    storageProvider.getStorageInfo().then(setStorageInfo).catch(console.error);
  }, [storageProvider]);

  const openProjectList = useCallback(() => {
    setIsProjectListOpen(true);
  }, []);

  const loadProject = useCallback(async (projectMeta: SavedVideoProject) => {
    setIsLoadingProject(true);
    setProjectListOperation("load");
    setLoadProgress(null);
    try {
      const loaded = await storageProvider.getProject(projectMeta.id, setLoadProgress);
      if (!loaded) {
        showErrorToast("Failed to load project");
        return;
      }

      const loadedProject = loaded.project;
      const normalizedClips = loadedProject.clips.map((clip) => normalizeLoadedClip(clip));
      const restoredClips = await restoreClipsWithLocalMedia(normalizedClips);
      const restoredMasks = loadedProject.masks || [];

      const loadedDuration = calculateProjectDuration(restoredClips);
      const normalizedPlayback = normalizeLoadedPlayback(loaded, loadedDuration);
      const restoredProject: VideoProject = {
        ...loadedProject,
        name: loaded.name,
        tracks: loadedProject.tracks,
        clips: restoredClips,
        duration: loadedDuration,
      };

      setProjectName(loaded.name);
      setProject(restoredProject);
      restoreTracks(loadedProject.tracks);
      restoreClips(restoredClips);
      restoreMasks(restoredMasks);
      setViewState(normalizedPlayback.timelineView);
      setLoopRange(
        normalizedPlayback.loopStart,
        normalizedPlayback.loopEnd,
        normalizedPlayback.loop,
        normalizedPlayback.duration,
      );
      seek(normalizedPlayback.persistedCurrentTime);

      try {
        await saveVideoAutosave({
          project: restoredProject,
          projectName: loaded.name,
          tracks: loadedProject.tracks,
          clips: restoredClips,
          masks: restoredMasks,
          timelineView: normalizedPlayback.timelineView,
          currentTime: normalizedPlayback.persistedCurrentTime,
          playbackRange: normalizedPlayback.playbackRange,
          toolMode,
          autoKeyframeEnabled,
          selectedClipIds: [],
          selectedMaskIds: [],
        });
      } catch (error) {
        console.error("Failed to persist autosave after project load:", error);
      }

      setCurrentProjectId(loaded.id);
      selectClips([]);
      clearHistory();
      clearMaskHistory();
      setIsProjectListOpen(false);
    } catch (error) {
      console.error("Failed to load project:", error);
      showErrorToast(`Load failed: ${(error as Error).message}`);
    } finally {
      setIsLoadingProject(false);
      setLoadProgress(null);
      setProjectListOperation(null);
    }
  }, [
    clearHistory,
    clearMaskHistory,
    restoreClips,
    restoreMasks,
    restoreTracks,
    seek,
    selectClips,
    setCurrentProjectId,
    setLoopRange,
    setProject,
    setProjectName,
    setViewState,
    storageProvider,
    toolMode,
    autoKeyframeEnabled,
  ]);

  const deleteProject = useCallback(async (projectId: string) => {
    const shouldDelete = await confirmDialog({
      title: "Delete Project",
      message: deleteConfirmLabel || "Delete this project?",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!shouldDelete) return;
    setIsLoadingProject(true);
    setProjectListOperation("delete");
    setLoadProgress(null);
    try {
      await storageProvider.deleteProject(projectId, setLoadProgress);
      const projects = await storageProvider.getAllProjects();
      setSavedProjects(projects);
      if (currentProjectId === projectId) setCurrentProjectId(null);
    } catch (error) {
      console.error("Failed to delete project:", error);
    } finally {
      setIsLoadingProject(false);
      setLoadProgress(null);
      setProjectListOperation(null);
    }
  }, [currentProjectId, deleteConfirmLabel, setCurrentProjectId, storageProvider]);

  return {
    currentProjectId,
    setCurrentProjectId,
    savedProjects,
    setSavedProjects,
    storageInfo,
    setStorageInfo,
    isProjectListOpen,
    setIsProjectListOpen,
    isLoadingProject,
    loadProgress,
    projectListOperation,
    openProjectList,
    loadProject,
    deleteProject,
  };
}
