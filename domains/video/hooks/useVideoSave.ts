"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  SavedVideoProject,
  VideoProject,
  VideoTrack,
  MaskData,
  TimelineViewState,
  Clip,
  PlaybackRangeState,
} from "../types";
import {
  saveVideoAutosave,
  VIDEO_AUTOSAVE_DEBOUNCE_MS,
} from "../utils/videoAutosave";
import {
  VideoStorageProvider,
  VideoStorageInfo,
} from "@/domains/video/services/videoProjectStorage";
import { type SaveLoadProgress } from "@/shared/lib/firebase/firebaseVideoStorage";
import { TIMELINE } from "../constants";

// ============================================
// Types
// ============================================

export interface UseVideoSaveOptions {
  storageProvider: VideoStorageProvider;

  // Video state
  project: VideoProject;
  projectName: string;
  currentProjectId: string | null;
  tracks: VideoTrack[];
  clips: Clip[];
  masks: MaskData[];
  viewState: TimelineViewState;
  currentTime: number;
  playbackRange?: PlaybackRangeState;
  toolMode: string;
  selectedClipIds: string[];
  selectedMaskIds: string[];
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;

  // Callbacks
  setCurrentProjectId: (id: string | null) => void;
  setSavedProjects: (projects: SavedVideoProject[]) => void;
  setStorageInfo: (info: VideoStorageInfo) => void;

  // Configuration
  enabled?: boolean;
  isInitialized?: boolean;
}

export interface UseVideoSaveReturn {
  saveProject: () => Promise<void>;
  saveAsProject: (nameOverride?: string) => Promise<void>;
  isSaving: boolean;
  saveProgress: SaveLoadProgress | null;
}

// ============================================
// Hook Implementation
// ============================================

function calculateProjectDuration(clips: Clip[]): number {
  const maxEnd = clips.reduce(
    (max, clip) => Math.max(max, clip.startTime + clip.duration),
    0
  );
  return Math.max(maxEnd, 1);
}

function sanitizeTimelineView(viewState: TimelineViewState): TimelineViewState {
  const zoom = Number.isFinite(viewState.zoom) ? viewState.zoom : TIMELINE.DEFAULT_ZOOM;
  const scrollX = Number.isFinite(viewState.scrollX) ? viewState.scrollX : 0;
  const scrollY = Number.isFinite(viewState.scrollY) ? viewState.scrollY : 0;
  return {
    ...viewState,
    zoom: Math.max(TIMELINE.MIN_ZOOM, Math.min(TIMELINE.MAX_ZOOM, zoom)),
    scrollX: Math.max(0, scrollX),
    scrollY: Math.max(0, scrollY),
    snapEnabled: viewState.snapEnabled ?? true,
    snapToFrames: viewState.snapToFrames ?? false,
    snapToClips: viewState.snapToClips ?? true,
  };
}

export function useVideoSave(options: UseVideoSaveOptions): UseVideoSaveReturn {
  const {
    storageProvider,
    project,
    projectName,
    currentProjectId,
    tracks,
    clips,
    masks,
    viewState,
    currentTime,
    playbackRange,
    toolMode,
    selectedClipIds,
    selectedMaskIds,
    previewCanvasRef,
    setCurrentProjectId,
    setSavedProjects,
    setStorageInfo,
    enabled = true,
    isInitialized = true,
  } = options;

  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<SaveLoadProgress | null>(null);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savingRef = useRef(false);

  // Generate thumbnail from preview canvas
  const generateThumbnail = useCallback((): string | undefined => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return undefined;
    try {
      return canvas.toDataURL("image/png");
    } catch {
      return undefined;
    }
  }, [previewCanvasRef]);

  // Build saved project data
  const buildSavedProject = useCallback(
    (forceNewId: boolean, nameOverride?: string): SavedVideoProject => {
      const resolvedName = nameOverride || projectName;
      const duration = calculateProjectDuration(clips);
      const normalizedTimelineView = sanitizeTimelineView(viewState);
      const normalizedPlaybackRange = playbackRange
        ? (() => {
            const loopStart = Math.max(0, Math.min(playbackRange.loopStart, duration));
            const loopEnd = Math.max(loopStart + 0.001, Math.min(playbackRange.loopEnd, duration));
            return {
              loop: Boolean(playbackRange.loop),
              loopStart,
              loopEnd,
            };
          })()
        : undefined;

      return {
        id: forceNewId
          ? crypto.randomUUID()
          : currentProjectId || crypto.randomUUID(),
        name: resolvedName,
        project: {
          ...project,
          name: resolvedName,
          tracks: tracks.map((track) => ({ ...track })),
          clips: clips.map((clip) => ({ ...clip, position: { ...clip.position } })),
          masks: masks.map((mask) => ({ ...mask })),
          duration,
        },
        timelineView: normalizedTimelineView,
        currentTime,
        playbackRange: normalizedPlaybackRange,
        savedAt: Date.now(),
      };
    },
    [project, projectName, currentProjectId, tracks, clips, masks, viewState, currentTime, playbackRange]
  );

  // Refresh project list after save
  const refreshProjectList = useCallback(async () => {
    const projects = await storageProvider.getAllProjects();
    setSavedProjects(projects);
    const info = await storageProvider.getStorageInfo();
    setStorageInfo(info);
  }, [storageProvider, setSavedProjects, setStorageInfo]);

  // Save project (overwrites existing or creates new)
  const saveProject = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;

    const savedProject = buildSavedProject(false);
    const thumbnailDataUrl = generateThumbnail();

    setIsSaving(true);
    setSaveProgress(null);
    try {
      await storageProvider.saveProject(savedProject, thumbnailDataUrl, setSaveProgress);
      setCurrentProjectId(savedProject.id);
      await refreshProjectList();
    } catch (error) {
      console.error("Failed to save video project:", error);
      throw error;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
      setSaveProgress(null);
    }
  }, [buildSavedProject, generateThumbnail, storageProvider, setCurrentProjectId, refreshProjectList]);

  // Save as new project
  const saveAsProject = useCallback(
    async (nameOverride?: string) => {
      if (savingRef.current) return;
      savingRef.current = true;

      const savedProject = buildSavedProject(true, nameOverride);
      const thumbnailDataUrl = generateThumbnail();

      setIsSaving(true);
      setSaveProgress(null);
      try {
        await storageProvider.saveProject(savedProject, thumbnailDataUrl, setSaveProgress);
        setCurrentProjectId(savedProject.id);
        await refreshProjectList();
      } catch (error) {
        console.error("Failed to save video project:", error);
        throw error;
      } finally {
        savingRef.current = false;
        setIsSaving(false);
        setSaveProgress(null);
      }
    },
    [buildSavedProject, generateThumbnail, storageProvider, setCurrentProjectId, refreshProjectList]
  );

  // Autosave effect (to IndexedDB, not cloud)
  useEffect(() => {
    if (!isInitialized || !enabled) return;
    if (clips.length === 0) return;

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      saveVideoAutosave({
        project,
        projectName,
        tracks,
        clips,
        masks,
        timelineView: sanitizeTimelineView(viewState),
        currentTime,
        playbackRange,
        toolMode: toolMode as import("../types").VideoToolMode,
        selectedClipIds,
        selectedMaskIds,
      });
    }, VIDEO_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [
    isInitialized,
    enabled,
    project,
    projectName,
    tracks,
    clips,
    masks,
    viewState,
    currentTime,
    playbackRange,
    toolMode,
    selectedClipIds,
    selectedMaskIds,
  ]);

  return {
    saveProject,
    saveAsProject,
    isSaving,
    saveProgress,
  };
}
