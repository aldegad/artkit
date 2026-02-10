"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage, useAuth } from "@/shared/contexts";
import { HeaderContent, SaveToast, LoadingOverlay, Select, Scrollbar } from "@/shared/components";
import {
  LockAspectIcon,
  UnlockAspectIcon,
  SquareExpandIcon,
  SquareFitIcon,
  CanvasExpandIcon,
  VolumeOnIcon,
  VolumeMutedIcon,
} from "@/shared/components/icons";
import {
  VideoStateProvider,
  VideoRefsProvider,
  TimelineProvider,
  MaskProvider,
  VideoLayoutProvider,
  useVideoState,
  useVideoRefs,
  useTimeline,
  useMask,
  useVideoLayout,
  useVideoSave,
  useVideoExport,
  VideoMenuBar,
  VideoToolbar,
  VideoExportModal,
  MaskControls,
  VideoSplitContainer,
  VideoFloatingWindows,
  VideoProjectListModal,
  registerVideoPanelComponent,
  clearVideoPanelComponents,
  VideoPreviewPanelContent,
  VideoTimelinePanelContent,
  clearVideoAutosave,
  saveMediaBlob,
  loadMediaBlob,
  copyMediaBlob,
  SUPPORTED_VIDEO_FORMATS,
  SUPPORTED_IMAGE_FORMATS,
  SUPPORTED_AUDIO_FORMATS,
  TIMELINE,
  type Clip,
  type SavedVideoProject,
  type TimelineViewState,
} from "@/domains/video";
import { useVideoKeyboardShortcuts } from "@/domains/video/hooks";
import {
  getVideoStorageProvider,
  type VideoStorageInfo,
} from "@/domains/video/services/videoProjectStorage";
import { type SaveLoadProgress } from "@/shared/lib/firebase/firebaseVideoStorage";
import { LayoutNode, isSplitNode, isPanelNode } from "@/shared/types/layout";
import { ASPECT_RATIOS, ASPECT_RATIO_VALUES, type AspectRatio } from "@/shared/types/aspectRatio";

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9-_ ]+/g, "").replace(/\s+/g, "-") || "untitled-project";
}

function calculateProjectDuration(clips: Clip[]): number {
  const maxEnd = clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
  return Math.max(maxEnd, 10);
}

function cloneClip(clip: Clip): Clip {
  return {
    ...clip,
    position: { ...clip.position },
    sourceSize: { ...clip.sourceSize },
  };
}

function normalizeLoadedClip(clip: Clip): Clip {
  if (clip.type === "video") {
    return {
      ...clip,
      hasAudio: clip.hasAudio ?? true,
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  if (clip.type === "audio") {
    return {
      ...clip,
      sourceSize: clip.sourceSize || { width: 0, height: 0 },
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  return clip;
}

function findPanelNodeIdByPanelId(node: LayoutNode, panelId: string): string | null {
  if (isPanelNode(node) && node.panelId === panelId) {
    return node.id;
  }

  if (isSplitNode(node)) {
    for (const child of node.children) {
      const found = findPanelNodeIdByPanelId(child, panelId);
      if (found) return found;
    }
  }

  return null;
}

function VideoDockableArea() {
  const { layoutState } = useVideoLayout();

  return (
    <>
      <VideoSplitContainer node={layoutState.root} />
      <VideoFloatingWindows />
    </>
  );
}

function VideoEditorContent() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const storageProvider = useMemo(() => getVideoStorageProvider(user), [user]);
  const {
    project,
    projectName,
    setProject,
    setProjectName,
    toolMode,
    setToolMode,
    selectedClipIds,
    selectedMaskIds,
    selectClips,
    selectMasksForTimeline,
    deselectAll,
    togglePlay,
    play,
    pause,
    stop,
    seek,
    setLoopRange,
    toggleLoop,
    stepForward,
    stepBackward,
    playback,
    clipboardRef,
    hasClipboard,
    setHasClipboard,
    cropArea,
    setCropArea,
    canvasExpandMode,
    setCanvasExpandMode,
    cropAspectRatio,
    setCropAspectRatio,
    lockCropAspect,
    setLockCropAspect,
    previewPreRenderEnabled,
    togglePreviewPreRender,
  } = useVideoState();
  const { previewCanvasRef } = useVideoRefs();
  const {
    tracks,
    clips,
    viewState,
    setZoom,
    setScrollX,
    setViewState,
    addTrack,
    addVideoClip,
    addAudioClip,
    addImageClip,
    removeClip,
    addClips,
    updateClip,
    restoreTracks,
    restoreClips,
    saveToHistory,
    undo,
    redo,
    clearHistory,
    canUndo,
    canRedo,
    isAutosaveInitialized,
  } = useTimeline();
  const { startMaskEdit, isEditingMask, endMaskEdit, activeMaskId, deleteMask, duplicateMask, deselectMask, selectMask, restoreMasks, masks: masksMap, saveMaskData, updateMaskTime } = useMask();
  const {
    layoutState,
    isPanelOpen,
    addPanel,
    removePanel,
    openFloatingWindow,
    closeFloatingWindow,
    resetLayout,
  } = useVideoLayout();

  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const audioHistorySavedRef = useRef(false);
  const visualHistorySavedRef = useRef(false);

  // Save system state
  const [savedProjects, setSavedProjects] = useState<SavedVideoProject[]>([]);
  const [storageInfo, setStorageInfo] = useState<VideoStorageInfo>({ used: 0, quota: 0, percentage: 0 });
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [loadProgress, setLoadProgress] = useState<SaveLoadProgress | null>(null);
  const [projectListOperation, setProjectListOperation] = useState<"load" | "delete" | null>(null);
  const [saveCount, setSaveCount] = useState(0);

  const masksArray = useMemo(() => Array.from(masksMap.values()), [masksMap]);
  const playbackRange = useMemo(() => ({
    loop: playback.loop,
    loopStart: playback.loopStart,
    loopEnd: playback.loopEnd,
  }), [playback.loop, playback.loopStart, playback.loopEnd]);
  const projectRef = useRef(project);
  projectRef.current = project;

  const { saveProject, saveAsProject, isSaving, saveProgress } = useVideoSave({
    storageProvider,
    project,
    projectName,
    currentProjectId,
    tracks,
    clips,
    masks: masksArray,
    viewState,
    currentTime: playback.currentTime,
    playbackRange,
    toolMode,
    selectedClipIds,
    selectedMaskIds,
    previewCanvasRef,
    setCurrentProjectId,
    setSavedProjects,
    setStorageInfo,
  });

  const handleExportSettled = useCallback(() => {
    setShowExportModal(false);
  }, []);

  const { isExporting, exportProgress, exportVideo: handleExport } = useVideoExport({
    project,
    projectName,
    playback,
    clips,
    tracks,
    masksMap,
    exportFailedLabel: t.exportFailed,
    onSettled: handleExportSettled,
  });

  useEffect(() => {
    registerVideoPanelComponent("preview", () => <VideoPreviewPanelContent />);
    registerVideoPanelComponent("timeline", () => <VideoTimelinePanelContent />);

    return () => {
      clearVideoPanelComponents();
    };
  }, []);

  // Restore masks from autosave into MaskContext after autosave finishes loading
  // postRestorationRef prevents auto-start mask edit from firing during initial load
  const masksRestoredRef = useRef(false);
  const postRestorationRef = useRef(false);
  useEffect(() => {
    if (!isAutosaveInitialized || masksRestoredRef.current) return;
    masksRestoredRef.current = true;
    if (project.masks && project.masks.length > 0) {
      restoreMasks(project.masks);
    }
    // Allow auto-start mask edit only after masks are restored and rendered
    const timer = setTimeout(() => {
      postRestorationRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [isAutosaveInitialized, project.masks, restoreMasks]);

  // After autosave restore: sync selectedMaskIds → MaskContext.activeMaskId
  // so that MaskControls shows when a mask was selected at save time
  const maskSelectionSyncedRef = useRef(false);
  useEffect(() => {
    if (!masksRestoredRef.current || maskSelectionSyncedRef.current) return;
    if (masksMap.size > 0 && selectedMaskIds.length > 0) {
      maskSelectionSyncedRef.current = true;
      selectMask(selectedMaskIds[0]);
    }
  }, [masksMap, selectedMaskIds, selectMask]);

  // Sync MaskContext masks → project.masks (MaskContext is the single source of truth)
  useEffect(() => {
    if (!masksRestoredRef.current) return;
    setProject({
      ...projectRef.current,
      masks: masksArray,
    });
  }, [masksArray, setProject]);

  // Auto-switch to mask tool when entering mask edit mode (e.g., double-click mask clip)
  useEffect(() => {
    if (isEditingMask && toolMode !== "mask") {
      setToolMode("mask");
    }
  }, [isEditingMask, toolMode, setToolMode]);

  // Load saved projects when storage provider changes
  useEffect(() => {
    storageProvider.getAllProjects().then(setSavedProjects).catch(console.error);
    storageProvider.getStorageInfo().then(setStorageInfo).catch(console.error);
  }, [storageProvider]);

  const hasContent = clips.length > 0;
  const selectedClip = selectedClipIds.length > 0
    ? clips.find((clip) => clip.id === selectedClipIds[0]) || null
    : null;
  const selectedAudioClip = selectedClip && selectedClip.type !== "image" ? selectedClip : null;
  const selectedVisualClip = selectedClip && selectedClip.type !== "audio" ? selectedClip : null;
  const isTimelineVisible = isPanelOpen("timeline");

  // buildSavedProject is now inside useVideoSave hook

  const importMediaFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      saveToHistory();

      let targetVideoTrackId = tracks.find((track) => track.type === "video")?.id || null;
      let targetAudioTrackId = tracks.find((track) => track.type === "audio")?.id || null;
      const hasExistingVisualClip = clips.some((clip) => clip.type !== "audio");
      let insertTime = playback.currentTime;
      let visualImportedCount = 0;

      for (const file of files) {
        const isVideo =
          file.type.startsWith("video/") ||
          SUPPORTED_VIDEO_FORMATS.some((format) => file.type === format);
        const isImage =
          file.type.startsWith("image/") ||
          SUPPORTED_IMAGE_FORMATS.some((format) => file.type === format);
        const isAudio =
          file.type.startsWith("audio/") ||
          SUPPORTED_AUDIO_FORMATS.some((format) => file.type === format);

        if (!isVideo && !isImage && !isAudio) {
          continue;
        }

        if (isVideo) {
          if (!targetVideoTrackId) {
            targetVideoTrackId = addTrack("Video 1", "video");
          }

          const url = URL.createObjectURL(file);
          const video = document.createElement("video");
          video.src = url;

          const metadata = await new Promise<{ duration: number; size: { width: number; height: number } } | null>((resolve) => {
            video.onloadedmetadata = () => {
              resolve({
                duration: Math.max(video.duration || 0, 0.1),
                size: { width: video.videoWidth || project.canvasSize.width, height: video.videoHeight || project.canvasSize.height },
              });
            };
            video.onerror = () => resolve(null);
          });

          if (!metadata) {
            URL.revokeObjectURL(url);
            continue;
          }

          const isFirstVisual = !hasExistingVisualClip && visualImportedCount === 0;
          if (isFirstVisual) {
            setProject({
              ...project,
              canvasSize: metadata.size,
            });
          }

          const clipId = addVideoClip(targetVideoTrackId, url, metadata.duration, metadata.size, Math.max(0, insertTime), isFirstVisual ? metadata.size : undefined);
          try {
            await saveMediaBlob(clipId, file);
          } catch (error) {
            console.error("Failed to save media blob:", error);
          }

          insertTime += metadata.duration;
          visualImportedCount += 1;
          continue;
        }

        if (isAudio) {
          const url = URL.createObjectURL(file);
          const audio = document.createElement("audio");
          audio.src = url;

          const metadata = await new Promise<{ duration: number } | null>((resolve) => {
            audio.onloadedmetadata = () => {
              resolve({
                duration: Math.max(audio.duration || 0, 0.1),
              });
            };
            audio.onerror = () => resolve(null);
          });

          if (!metadata) {
            URL.revokeObjectURL(url);
            continue;
          }

          if (!targetAudioTrackId) {
            targetAudioTrackId = addTrack("Audio 1", "audio");
          }

          const clipId = addAudioClip(
            targetAudioTrackId,
            url,
            metadata.duration,
            Math.max(0, insertTime),
            { ...project.canvasSize }
          );

          try {
            await saveMediaBlob(clipId, file);
          } catch (error) {
            console.error("Failed to save media blob:", error);
          }

          insertTime += metadata.duration;
          continue;
        }

        if (!targetVideoTrackId) {
          targetVideoTrackId = addTrack("Video 1", "video");
        }

        const url = URL.createObjectURL(file);
        const image = new Image();
        image.src = url;

        const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => resolve(null);
        });

        if (!size) {
          URL.revokeObjectURL(url);
          continue;
        }

        const isFirstVisualImg = !hasExistingVisualClip && visualImportedCount === 0;
        if (isFirstVisualImg) {
          setProject({
            ...project,
            canvasSize: size,
          });
        }

        const clipId = addImageClip(targetVideoTrackId, url, size, Math.max(0, insertTime), 5, isFirstVisualImg ? size : undefined);
        try {
          await saveMediaBlob(clipId, file);
        } catch (error) {
          console.error("Failed to save media blob:", error);
        }

        insertTime += 5;
        visualImportedCount += 1;
      }
    },
    [
      saveToHistory,
      tracks,
      addTrack,
      playback.currentTime,
      clips.length,
      project,
      setProject,
      addVideoClip,
      addAudioClip,
      addImageClip,
    ]
  );

  // Menu handlers
  const handleNew = useCallback(async () => {
    if (window.confirm(t.newProjectConfirm)) {
      await clearVideoAutosave();
      window.location.reload();
    }
  }, [t]);

  const handleOpen = useCallback(() => {
    setIsProjectListOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await saveProject();
      setSaveCount((c) => c + 1);
    } catch (error) {
      console.error("Failed to save project:", error);
      alert(`Save failed: ${(error as Error).message}`);
    }
  }, [saveProject]);

  const handleSaveAs = useCallback(async () => {
    const suggestedName = projectName || "Untitled Project";
    const nextName = window.prompt("Project name", suggestedName);
    if (!nextName) return;

    setProjectName(nextName);
    try {
      await saveAsProject(nextName);
      setSaveCount((c) => c + 1);
    } catch (error) {
      console.error("Failed to save project:", error);
      alert(`Save failed: ${(error as Error).message}`);
    }
  }, [projectName, setProjectName, saveAsProject]);

  const handleLoadProject = useCallback(async (projectMeta: SavedVideoProject) => {
    setIsLoadingProject(true);
    setProjectListOperation("load");
    setLoadProgress(null);
    try {
      const loaded = await storageProvider.getProject(projectMeta.id, setLoadProgress);
      if (!loaded) {
        alert("Failed to load project");
        return;
      }

      const loadedProject = loaded.project;
      const normalizedClips = loadedProject.clips.map((clip) => normalizeLoadedClip(clip));
      const clipIdsBySourceId = new Map<string, string[]>();
      for (const clip of normalizedClips) {
        if (!clip.sourceId) continue;
        const ids = clipIdsBySourceId.get(clip.sourceId) || [];
        ids.push(clip.id);
        clipIdsBySourceId.set(clip.sourceId, ids);
      }
      const sourceBlobCache = new Map<string, Blob>();

      // Restore media blobs from IndexedDB and create new blob URLs
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
        } else if (!clip.sourceUrl.startsWith("blob:")) {
          // Non-blob URL (e.g., remote URL), keep as is
          restoredClips.push(clip);
        }
        // Skip clips with invalid blob URLs (no stored blob)
      }

      const loadedDuration = calculateProjectDuration(restoredClips);

      setProjectName(loaded.name);
      setProject({
        ...loadedProject,
        name: loaded.name,
        tracks: loadedProject.tracks,
        clips: restoredClips,
        duration: loadedDuration,
      });
      restoreTracks(loadedProject.tracks);
      restoreClips(restoredClips);
      restoreMasks(loadedProject.masks || []);

      if (loaded.timelineView) {
        setViewState(loaded.timelineView);
      }
      const restoredTime = typeof loaded.currentTime === "number" ? loaded.currentTime : 0;
      seek(restoredTime);
      const duration = Math.max(loadedDuration, 0.001);
      const targetLoop = loaded.playbackRange?.loop ?? false;
      const targetStart = Math.max(0, Math.min(loaded.playbackRange?.loopStart ?? 0, duration));
      const targetEnd = Math.max(
        targetStart + 0.001,
        Math.min(loaded.playbackRange?.loopEnd ?? duration, duration)
      );
      window.setTimeout(() => {
        setLoopRange(targetStart, targetEnd, true);
        if (!targetLoop) {
          toggleLoop();
          seek(restoredTime);
        }
      }, 0);

      setCurrentProjectId(loaded.id);
      selectClips([]);
      clearHistory();
      setIsProjectListOpen(false);
    } catch (error) {
      console.error("Failed to load project:", error);
      alert(`Load failed: ${(error as Error).message}`);
    } finally {
      setIsLoadingProject(false);
      setLoadProgress(null);
      setProjectListOperation(null);
    }
  }, [storageProvider, setProjectName, setProject, restoreTracks, restoreClips, restoreMasks, setViewState, seek, setLoopRange, toggleLoop, selectClips, clearHistory]);

  const handleDeleteProject = useCallback(async (id: string) => {
    if (!window.confirm(t.deleteConfirm || "Delete this project?")) return;
    setIsLoadingProject(true);
    setProjectListOperation("delete");
    setLoadProgress(null);
    try {
      await storageProvider.deleteProject(id, setLoadProgress);
      const projects = await storageProvider.getAllProjects();
      setSavedProjects(projects);
      if (currentProjectId === id) setCurrentProjectId(null);
    } catch (error) {
      console.error("Failed to delete project:", error);
    } finally {
      setIsLoadingProject(false);
      setLoadProgress(null);
      setProjectListOperation(null);
    }
  }, [storageProvider, currentProjectId, t]);

  const handleImportMedia = useCallback(() => {
    mediaFileInputRef.current?.click();
  }, []);

  // Edit menu handlers
  const handleUndo = useCallback(() => {
    undo();
    deselectAll();
  }, [undo, deselectAll]);

  const handleRedo = useCallback(() => {
    redo();
    deselectAll();
  }, [redo, deselectAll]);

  const handleCopy = useCallback(() => {
    if (selectedClipIds.length === 0) return;
    const selectedClips = clips.filter((c) => selectedClipIds.includes(c.id));
    if (selectedClips.length === 0) return;

    clipboardRef.current = {
      clips: selectedClips.map(cloneClip),
      mode: "copy",
      sourceTime: playback.currentTime,
    };
    setHasClipboard(true);
  }, [selectedClipIds, clips, playback.currentTime, clipboardRef, setHasClipboard]);

  const handleCut = useCallback(() => {
    if (selectedClipIds.length === 0) return;
    const selectedClips = clips.filter((c) => selectedClipIds.includes(c.id));
    if (selectedClips.length === 0) return;

    clipboardRef.current = {
      clips: selectedClips.map(cloneClip),
      mode: "cut",
      sourceTime: playback.currentTime,
    };
    setHasClipboard(true);

    saveToHistory();
    selectedClipIds.forEach((id) => removeClip(id));
    deselectAll();
  }, [selectedClipIds, clips, playback.currentTime, clipboardRef, setHasClipboard, saveToHistory, removeClip, deselectAll]);

  const handlePaste = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (!clipboard || clipboard.clips.length === 0) return;

    saveToHistory();

    const currentTime = playback.currentTime;
    const earliestStart = Math.min(...clipboard.clips.map((c) => c.startTime));
    const timeOffset = currentTime - earliestStart;

    const newClips = clipboard.clips.map((clipData) => ({
      ...cloneClip(clipData),
      id: crypto.randomUUID(),
      startTime: Math.max(0, clipData.startTime + timeOffset),
    }));

    // Keep media persistence stable for duplicated IDs.
    void Promise.all(
      newClips.map((newClip, index) =>
        copyMediaBlob(clipboard.clips[index].id, newClip.id).catch((error) => {
          console.error("Failed to copy media blob on paste:", error);
        })
      )
    );

    addClips(newClips);
    selectClips(newClips.map((c) => c.id));

    if (clipboard.mode === "cut") {
      clipboardRef.current = null;
      setHasClipboard(false);
    }
  }, [playback.currentTime, clipboardRef, setHasClipboard, saveToHistory, addClips, selectClips]);

  const handleDelete = useCallback(() => {
    // Delete selected mask if one is active (editing mode)
    if (activeMaskId && isEditingMask) {
      endMaskEdit();
      deleteMask(activeMaskId);
      return;
    }

    const hasClips = selectedClipIds.length > 0;
    const hasMasks = selectedMaskIds.length > 0;

    // Also handle active mask (non-editing) if nothing else selected
    if (!hasClips && !hasMasks) {
      if (activeMaskId) {
        deleteMask(activeMaskId);
      }
      return;
    }

    saveToHistory();
    selectedClipIds.forEach((id) => removeClip(id));
    selectedMaskIds.forEach((id) => deleteMask(id));
    deselectAll();
  }, [selectedClipIds, selectedMaskIds, saveToHistory, removeClip, deselectAll, activeMaskId, isEditingMask, deleteMask, endMaskEdit]);

  const handleDuplicate = useCallback(() => {
    const hasClips = selectedClipIds.length > 0;
    const hasMasks = selectedMaskIds.length > 0;
    if (!hasClips && !hasMasks) return;

    saveToHistory();

    const duplicatedClipIds: string[] = [];
    const duplicatedMaskIds: string[] = [];

    // Duplicate clips
    if (hasClips) {
      const selectedClips = clips.filter((clip) => selectedClipIds.includes(clip.id));
      const duplicated = selectedClips.map((clip) => ({
        ...cloneClip(clip),
        id: crypto.randomUUID(),
        startTime: clip.startTime + 0.25,
        name: `${clip.name} (Copy)`,
      }));
      void Promise.all(
        duplicated.map((dupClip, index) =>
          copyMediaBlob(selectedClips[index].id, dupClip.id).catch((error) => {
            console.error("Failed to copy media blob on duplicate:", error);
          })
        )
      );
      addClips(duplicated);
      duplicatedClipIds.push(...duplicated.map((c) => c.id));
    }

    // Duplicate masks
    for (const mid of selectedMaskIds) {
      const newId = duplicateMask(mid);
      if (newId) {
        const source = masksMap.get(mid);
        if (source) {
          updateMaskTime(newId, source.startTime + 0.25, source.duration);
        }
        duplicatedMaskIds.push(newId);
      }
    }

    if (duplicatedClipIds.length > 0) selectClips(duplicatedClipIds);
    if (duplicatedMaskIds.length > 0) selectMasksForTimeline(duplicatedMaskIds);
  }, [selectedClipIds, selectedMaskIds, clips, saveToHistory, addClips, selectClips, selectMasksForTimeline, duplicateMask, masksMap, updateMaskTime]);

  const beginAudioAdjustment = useCallback(() => {
    if (audioHistorySavedRef.current) return;
    saveToHistory();
    audioHistorySavedRef.current = true;
  }, [saveToHistory]);

  const endAudioAdjustment = useCallback(() => {
    audioHistorySavedRef.current = false;
  }, []);

  const beginVisualAdjustment = useCallback(() => {
    if (visualHistorySavedRef.current) return;
    saveToHistory();
    visualHistorySavedRef.current = true;
  }, [saveToHistory]);

  const endVisualAdjustment = useCallback(() => {
    visualHistorySavedRef.current = false;
  }, []);

  const handleToggleSelectedClipMute = useCallback(() => {
    if (!selectedAudioClip) return;
    saveToHistory();
    updateClip(selectedAudioClip.id, {
      audioMuted: !(selectedAudioClip.audioMuted ?? false),
    });
  }, [selectedAudioClip, saveToHistory, updateClip]);

  const handleSelectedClipVolumeChange = useCallback(
    (volume: number) => {
      if (!selectedAudioClip) return;
      updateClip(selectedAudioClip.id, {
        audioVolume: Math.max(0, Math.min(100, volume)),
      });
    },
    [selectedAudioClip, updateClip]
  );

  const handleSelectedVisualScaleChange = useCallback((scalePercent: number) => {
    if (!selectedVisualClip) return;
    updateClip(selectedVisualClip.id, {
      scale: Math.max(0.05, Math.min(8, scalePercent / 100)),
    });
  }, [selectedVisualClip, updateClip]);

  const handleSelectedVisualRotationChange = useCallback((rotationDeg: number) => {
    if (!selectedVisualClip) return;
    updateClip(selectedVisualClip.id, {
      rotation: Math.max(-360, Math.min(360, rotationDeg)),
    });
  }, [selectedVisualClip, updateClip]);

  const handleSelectAllCrop = useCallback(() => {
    setCropArea({
      x: 0,
      y: 0,
      width: project.canvasSize.width,
      height: project.canvasSize.height,
    });
  }, [setCropArea, project.canvasSize.width, project.canvasSize.height]);

  const handleClearCrop = useCallback(() => {
    setCropArea(null);
    setCanvasExpandMode(false);
  }, [setCropArea, setCanvasExpandMode]);

  const getAspectRatioValue = useCallback((ratio: AspectRatio): number | null => {
    return ASPECT_RATIO_VALUES[ratio] ?? null;
  }, []);

  const handleCropWidthChange = useCallback((newWidth: number) => {
    if (!cropArea) return;
    if (lockCropAspect && cropArea.width > 0) {
      const ratio = cropArea.height / cropArea.width;
      setCropArea({ ...cropArea, width: newWidth, height: Math.round(newWidth * ratio) });
    } else {
      setCropArea({ ...cropArea, width: newWidth });
    }
  }, [cropArea, lockCropAspect, setCropArea]);

  const handleCropHeightChange = useCallback((newHeight: number) => {
    if (!cropArea) return;
    if (lockCropAspect && cropArea.height > 0) {
      const ratio = cropArea.width / cropArea.height;
      setCropArea({ ...cropArea, height: newHeight, width: Math.round(newHeight * ratio) });
    } else {
      setCropArea({ ...cropArea, height: newHeight });
    }
  }, [cropArea, lockCropAspect, setCropArea]);

  const handleExpandToSquare = useCallback(() => {
    if (!cropArea) return;
    const maxSide = Math.max(cropArea.width, cropArea.height);
    setCropArea({ ...cropArea, width: maxSide, height: maxSide });
  }, [cropArea, setCropArea]);

  const handleFitToSquare = useCallback(() => {
    if (!cropArea) return;
    const minSide = Math.min(cropArea.width, cropArea.height);
    setCropArea({ ...cropArea, width: minSide, height: minSide });
  }, [cropArea, setCropArea]);

  const handleApplyCrop = useCallback(() => {
    if (!cropArea) return;

    const width = Math.max(1, Math.round(cropArea.width));
    const height = Math.max(1, Math.round(cropArea.height));
    if (width < 2 || height < 2) return;

    const offsetX = Math.round(cropArea.x);
    const offsetY = Math.round(cropArea.y);

    saveToHistory();

    for (const clip of clips) {
      if (clip.type === "audio") continue;
      updateClip(clip.id, {
        position: {
          x: clip.position.x - offsetX,
          y: clip.position.y - offsetY,
        },
      });
    }

    setProject({
      ...project,
      canvasSize: { width, height },
    });

    setCropArea(null);
    setCanvasExpandMode(false);
  }, [cropArea, clips, saveToHistory, updateClip, setProject, project, setCropArea, setCanvasExpandMode]);

  // View menu handlers
  const handleZoomIn = useCallback(() => {
    setZoom(viewState.zoom * 1.25);
  }, [setZoom, viewState.zoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(viewState.zoom / 1.25);
  }, [setZoom, viewState.zoom]);

  const handleFitToScreen = useCallback(() => {
    const timelineRoot = document.querySelector("[data-video-timeline-root]") as HTMLDivElement | null;
    const width = timelineRoot?.clientWidth;
    if (!width) {
      setZoom(TIMELINE.DEFAULT_ZOOM);
      setScrollX(0);
      return;
    }

    const availableWidth = Math.max(100, width - 160);
    const duration = Math.max(project.duration, 1);
    setZoom(availableWidth / duration);
    setScrollX(0);
  }, [project.duration, setZoom, setScrollX]);

  // Canvas size adjustment
  const [canvasSizeInput, setCanvasSizeInput] = useState({ w: "", h: "" });
  const [isEditingCanvasSize, setIsEditingCanvasSize] = useState(false);

  const handleCanvasSizeSubmit = useCallback(() => {
    const w = parseInt(canvasSizeInput.w, 10);
    const h = parseInt(canvasSizeInput.h, 10);
    if (w > 0 && h > 0 && w <= 7680 && h <= 7680) {
      setProject({ ...project, canvasSize: { width: w, height: h } });
    }
    setIsEditingCanvasSize(false);
  }, [canvasSizeInput, setProject, project]);

  const handleToggleTimeline = useCallback(() => {
    const timelineWindow = layoutState.floatingWindows.find((window) => window.panelId === "timeline");
    if (timelineWindow) {
      closeFloatingWindow(timelineWindow.id);
      return;
    }

    const timelinePanelNodeId = findPanelNodeIdByPanelId(layoutState.root, "timeline");
    if (timelinePanelNodeId) {
      removePanel(timelinePanelNodeId);
      return;
    }

    const previewPanelNodeId = findPanelNodeIdByPanelId(layoutState.root, "preview");
    if (previewPanelNodeId) {
      addPanel(previewPanelNodeId, "timeline", "bottom");
      return;
    }

    openFloatingWindow("timeline", { x: 140, y: 140 });
  }, [layoutState, closeFloatingWindow, removePanel, addPanel, openFloatingWindow]);

  // Auto-pause when app/window loses foreground to prevent lingering audio playback.
  useEffect(() => {
    const pausePlaybackIfNeeded = () => {
      if (!playback.isPlaying) return;
      pause();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        pausePlaybackIfNeeded();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", pausePlaybackIfNeeded);
    window.addEventListener("pagehide", pausePlaybackIfNeeded);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", pausePlaybackIfNeeded);
      window.removeEventListener("pagehide", pausePlaybackIfNeeded);
    };
  }, [pause, playback.isPlaying]);

  // Handle mask tool toggle
  const handleToolModeChange = useCallback((mode: typeof toolMode) => {
    if (mode === "mask" && selectedClipIds.length > 0) {
      const selected = clips.filter((c) => selectedClipIds.includes(c.id) && c.type !== "audio");
      if (selected.length > 0) {
        const maskStart = Math.min(...selected.map((c) => c.startTime));
        const maskEnd = Math.max(...selected.map((c) => c.startTime + c.duration));
        startMaskEdit(selected[0].trackId, project.canvasSize, playback.currentTime, maskStart, maskEnd - maskStart);
      }
    }
    if (mode !== "mask" && isEditingMask) {
      endMaskEdit();
    }
    if (mode === "crop" && !cropArea) {
      setCropArea({
        x: 0,
        y: 0,
        width: project.canvasSize.width,
        height: project.canvasSize.height,
      });
    }
    setToolMode(mode);
  }, [selectedClipIds, clips, startMaskEdit, setToolMode, cropArea, setCropArea, project.canvasSize, playback.currentTime, isEditingMask, endMaskEdit]);

  // Auto-start mask edit when clip is selected while already in mask mode
  // Skip during initial restoration to prevent creating new masks before masks are loaded
  useEffect(() => {
    if (!postRestorationRef.current) return;
    if (toolMode !== "mask") return;
    if (selectedClipIds.length === 0) return;
    if (isEditingMask) return; // already editing

    const selected = clips.filter((c) => selectedClipIds.includes(c.id) && c.type !== "audio");
    if (selected.length > 0) {
      const maskStart = Math.min(...selected.map((c) => c.startTime));
      const maskEnd = Math.max(...selected.map((c) => c.startTime + c.duration));
      startMaskEdit(selected[0].trackId, project.canvasSize, playback.currentTime, maskStart, maskEnd - maskStart);
    }
  }, [toolMode, selectedClipIds, clips, isEditingMask, startMaskEdit, project.canvasSize, playback.currentTime]);


  // Keyboard shortcuts
  useVideoKeyboardShortcuts({
    togglePlay,
    stepForward,
    stepBackward,
    onToolModeChange: handleToolModeChange,
    toolMode,
    handleUndo,
    handleRedo,
    handleSave,
    handleOpen,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleDuplicate,
    handleZoomIn,
    handleZoomOut,
    handleFitToScreen,
    handleApplyCrop,
    activeMaskId,
    deselectMask,
    isEditingMask,
    endMaskEdit,
  });

  const menuTranslations = {
    file: t.file,
    edit: t.edit,
    view: t.view,
    window: t.window,
    settings: t.settings,
    new: t.new,
    load: t.load,
    save: t.save,
    saveAs: t.saveAs,
    importMedia: t.importMedia,
    exportVideo: t.exportVideo,
    undo: t.undo,
    redo: t.redo,
    cut: t.cut,
    copy: t.copy,
    paste: t.paste,
    delete: t.delete,
    zoomIn: t.zoomIn,
    zoomOut: t.zoomOut,
    fitToScreen: t.fitToScreen,
    timeline: t.timeline,
    previewVideoCache: t.previewVideoCache,
    resetLayout: t.resetLayout,
  };

  const toolbarTranslations = {
    select: t.select,
    selectDesc: t.selectDesc,
    hand: t.hand,
    handDesc: t.handToolTip,
    zoomInOut: t.zoomInOut,
    zoomToolTip: t.zoomToolTip,
    trim: t.trim,
    trimDesc: t.trimDesc,
    razor: t.razor,
    razorDesc: t.razorDesc,
    crop: t.crop,
    cropDesc: t.cropToolTip || "Crop and expand canvas",
    mask: t.mask,
    maskDesc: t.maskDesc,
  };

  return (
    <div
      className="h-full bg-background text-text-primary flex flex-col overflow-hidden relative"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Loading overlay during autosave restore */}
      <LoadingOverlay isLoading={!isAutosaveInitialized} message={t.loading || "Loading..."} />

      {/* Save toast notification (for non-cloud saves without progress indicator) */}
      {!saveProgress && (
        <SaveToast
          isSaving={isSaving}
          saveCount={saveCount}
          savingLabel={t.saving || "Saving…"}
          savedLabel={t.saved || "Saved"}
        />
      )}

      {/* Header Slot - Menu Bar + Project Info */}
      <HeaderContent
        title={t.videoEditor}
        menuBar={
          <VideoMenuBar
            onNew={handleNew}
            onLoad={handleOpen}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            onImportMedia={handleImportMedia}
            onExport={() => setShowExportModal(true)}
            canSave={hasContent}
            isSaving={isSaving}
            isLoading={isExporting}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            onCut={handleCut}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onDelete={handleDelete}
            hasSelection={selectedClipIds.length > 0 || selectedMaskIds.length > 0}
            hasClipboard={hasClipboard}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onFitToScreen={handleFitToScreen}
            onToggleTimeline={handleToggleTimeline}
            showTimeline={isTimelineVisible}
            onResetLayout={resetLayout}
            onTogglePreviewCache={togglePreviewPreRender}
            previewCacheEnabled={previewPreRenderEnabled}
            translations={menuTranslations}
          />
        }
        projectName={{
          value: projectName,
          onChange: setProjectName,
          placeholder: t.projectName,
        }}
        info={
          <span className="text-xs text-text-tertiary whitespace-nowrap ml-1">
            ({project.canvasSize.width}x{project.canvasSize.height})
          </span>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-surface-secondary border-b border-border-default overflow-x-auto">
        <VideoToolbar
          toolMode={toolMode}
          onToolModeChange={handleToolModeChange}
          onDelete={handleDelete}
          hasSelection={selectedClipIds.length > 0 || selectedMaskIds.length > 0 || !!activeMaskId}
          translations={toolbarTranslations}
        />

        {toolMode === "crop" && (
          <div className="flex items-center gap-2">
            {/* Aspect ratio selector */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary">Ratio:</span>
              <Select
                value={cropAspectRatio}
                onChange={(value) => setCropAspectRatio(value as AspectRatio)}
                options={ASPECT_RATIOS.map((r) => ({ value: r.value, label: r.label }))}
                size="sm"
              />
            </div>

            {/* Width/Height input */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary">W:</span>
              <input
                type="number"
                value={cropArea?.width ? Math.round(cropArea.width) : ""}
                onChange={(e) => handleCropWidthChange(Math.max(10, parseInt(e.target.value) || 10))}
                placeholder="---"
                className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
                min={10}
              />
              <span className="text-xs text-text-tertiary">x</span>
              <span className="text-xs text-text-secondary">H:</span>
              <input
                type="number"
                value={cropArea?.height ? Math.round(cropArea.height) : ""}
                onChange={(e) => handleCropHeightChange(Math.max(10, parseInt(e.target.value) || 10))}
                placeholder="---"
                className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
                min={10}
              />
              {/* Lock aspect ratio button */}
              <button
                onClick={() => setLockCropAspect(!lockCropAspect)}
                className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
                  lockCropAspect
                    ? "bg-accent-primary text-white"
                    : "hover:bg-interactive-hover text-text-secondary"
                }`}
                title={lockCropAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
              >
                {lockCropAspect ? <LockAspectIcon /> : <UnlockAspectIcon />}
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-border-default" />

            {/* Square buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleExpandToSquare}
                className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors flex items-center gap-0.5"
                title="Expand to square (longer side)"
              >
                <SquareExpandIcon />
                <span>Expand</span>
              </button>
              <button
                onClick={handleFitToSquare}
                className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors flex items-center gap-0.5"
                title="Fit to square (shorter side)"
              >
                <SquareFitIcon />
                <span>Fit</span>
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-border-default" />

            {/* Canvas expand mode toggle */}
            <button
              onClick={() => setCanvasExpandMode(!canvasExpandMode)}
              className={`px-1.5 py-0.5 text-xs rounded transition-colors flex items-center gap-0.5 ${
                canvasExpandMode
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover"
              }`}
              title={canvasExpandMode ? "Canvas expand mode ON" : "Canvas expand mode OFF"}
            >
              <CanvasExpandIcon />
              <span>Canvas</span>
            </button>

            {/* Divider */}
            <div className="w-px h-4 bg-border-default" />

            {/* All, Apply, Clear buttons */}
            <button
              onClick={handleSelectAllCrop}
              className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
            >
              All
            </button>
            {cropArea && (
              <>
                <button
                  onClick={handleApplyCrop}
                  className="px-1.5 py-0.5 text-xs bg-accent-primary text-white hover:bg-accent-primary/90 rounded transition-colors font-medium"
                  title="Apply crop/resize to canvas"
                >
                  Apply
                </button>
                <button
                  onClick={handleClearCrop}
                  className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        )}

        {selectedVisualClip && toolMode !== "crop" && (
          <>
            <div className="h-4 w-px bg-border-default mx-1" />
            <div className="flex items-center gap-2 min-w-[250px]">
              <span className="text-xs text-text-secondary">Scale</span>
              <input
                type="range"
                min={5}
                max={400}
                value={Math.round((selectedVisualClip.scale || 1) * 100)}
                onMouseDown={beginVisualAdjustment}
                onTouchStart={beginVisualAdjustment}
                onMouseUp={endVisualAdjustment}
                onTouchEnd={endVisualAdjustment}
                onChange={(e) => handleSelectedVisualScaleChange(Number(e.target.value))}
                className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-text-secondary w-10 text-right">
                {Math.round((selectedVisualClip.scale || 1) * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-1 min-w-[132px]">
              <span className="text-xs text-text-secondary">Rotate</span>
              <input
                type="number"
                value={Math.round(selectedVisualClip.rotation || 0)}
                onFocus={beginVisualAdjustment}
                onBlur={endVisualAdjustment}
                onChange={(e) => handleSelectedVisualRotationChange(Number(e.target.value))}
                className="w-16 px-2 py-1 rounded bg-surface-tertiary border border-border-default text-xs text-text-primary focus:outline-none focus:border-accent-primary"
              />
              <span className="text-xs text-text-tertiary">deg</span>
            </div>
          </>
        )}

        {selectedAudioClip && (
          <>
            <div className="h-4 w-px bg-border-default mx-1" />
            <div className="flex items-center gap-2 min-w-[220px]">
              <button
                onClick={handleToggleSelectedClipMute}
                className="p-1.5 rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
                title={(selectedAudioClip.audioMuted ?? false) ? "Unmute clip audio" : "Mute clip audio"}
              >
                {(selectedAudioClip.audioMuted ?? false)
                  ? <VolumeMutedIcon />
                  : <VolumeOnIcon />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={selectedAudioClip.audioVolume ?? 100}
                onMouseDown={beginAudioAdjustment}
                onTouchStart={beginAudioAdjustment}
                onMouseUp={endAudioAdjustment}
                onTouchEnd={endAudioAdjustment}
                onChange={(e) => handleSelectedClipVolumeChange(Number(e.target.value))}
                className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-text-secondary w-10 text-right">
                {selectedAudioClip.audioVolume ?? 100}%
              </span>
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Canvas size */}
        <div className="flex items-center gap-1 shrink-0">
          {isEditingCanvasSize ? (
            <form
              className="flex items-center gap-0.5"
              onSubmit={(e) => { e.preventDefault(); handleCanvasSizeSubmit(); }}
            >
              <input
                type="number"
                defaultValue={project.canvasSize.width}
                onChange={(e) => setCanvasSizeInput((p) => ({ ...p, w: e.target.value }))}
                onFocus={(e) => e.target.select()}
                autoFocus
                className="w-14 px-1 py-0.5 rounded bg-surface-tertiary border border-border-default text-xs text-text-primary text-center focus:outline-none focus:border-accent-primary"
                min={1}
                max={7680}
              />
              <span className="text-xs text-text-quaternary">x</span>
              <input
                type="number"
                defaultValue={project.canvasSize.height}
                onChange={(e) => setCanvasSizeInput((p) => ({ ...p, h: e.target.value }))}
                onFocus={(e) => e.target.select()}
                className="w-14 px-1 py-0.5 rounded bg-surface-tertiary border border-border-default text-xs text-text-primary text-center focus:outline-none focus:border-accent-primary"
                min={1}
                max={7680}
              />
              <button type="submit" className="px-1.5 py-0.5 text-[10px] rounded bg-accent-primary text-white hover:bg-accent-hover transition-colors">
                OK
              </button>
              <button type="button" onClick={() => setIsEditingCanvasSize(false)} className="px-1.5 py-0.5 text-[10px] rounded bg-surface-tertiary text-text-secondary hover:bg-interactive-hover transition-colors">
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => {
                setCanvasSizeInput({ w: String(project.canvasSize.width), h: String(project.canvasSize.height) });
                setIsEditingCanvasSize(true);
              }}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              title="Change canvas size"
            >
              {project.canvasSize.width}x{project.canvasSize.height}
            </button>
          )}
        </div>

      </div>

      {toolMode === "mask" && activeMaskId && (
        <Scrollbar
          className="bg-surface-primary border-b border-border-default shrink-0"
          overflow={{ x: "scroll", y: "hidden" }}
        >
          <MaskControls variant="toolbar" />
        </Scrollbar>
      )}

      {/* Main Content (shared docking/split system) */}
      <div className="flex-1 h-full w-full min-h-0 flex overflow-hidden relative">
        <VideoDockableArea />
      </div>

      {/* Hidden file input for media import */}
      <input
        ref={mediaFileInputRef}
        type="file"
        accept={[...SUPPORTED_VIDEO_FORMATS, ...SUPPORTED_IMAGE_FORMATS, ...SUPPORTED_AUDIO_FORMATS].join(",")}
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length > 0) {
            try {
              await importMediaFiles(files);
            } catch (error) {
              console.error("Media import failed:", error);
              alert(`${t.importFailed}: ${(error as Error).message}`);
            }
          }
          e.target.value = "";
        }}
      />

      {/* Save progress indicator */}
      {isSaving && saveProgress && (
        <div className="fixed bottom-4 right-4 z-50 bg-surface-primary border border-border-default rounded-lg shadow-lg p-3 min-w-[200px]">
          <div className="flex items-center gap-2 text-sm text-text-secondary mb-1">
            <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <span>Saving ({saveProgress.current}/{saveProgress.total})</span>
          </div>
          <div className="text-xs text-text-tertiary truncate">{saveProgress.clipName}</div>
          <div className="mt-1 w-full h-1 bg-surface-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary rounded-full transition-all"
              style={{ width: `${(saveProgress.current / saveProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Video Project List Modal */}
      <VideoProjectListModal
        isOpen={isProjectListOpen}
        onClose={() => setIsProjectListOpen(false)}
        projects={savedProjects}
        currentProjectId={currentProjectId}
        onLoadProject={handleLoadProject}
        onDeleteProject={handleDeleteProject}
        storageInfo={storageInfo}
        isLoading={isLoadingProject}
        loadProgress={loadProgress}
        translations={{
          savedProjects: t.savedProjects || "Saved Projects",
          noSavedProjects: t.noSavedProjects || "No saved projects",
          delete: t.delete,
          loading: projectListOperation === "delete" ? `${t.delete || "Delete"}...` : (t.loading || "Loading"),
        }}
      />

      {/* Export modal */}
      <VideoExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        defaultFileName={sanitizeFileName(projectName)}
        isExporting={isExporting}
        exportProgress={exportProgress}
        translations={{
          export: t.exportVideo,
          cancel: t.cancel,
          fileName: t.projectName,
          format: t.format,
          includeAudio: t.includeAudio,
        }}
      />
    </div>
  );
}

function VideoEditorWithMask() {
  return (
    <MaskProvider>
      <VideoLayoutProvider>
        <VideoEditorContent />
      </VideoLayoutProvider>
    </MaskProvider>
  );
}

function VideoEditorWithTimeline() {
  return (
    <TimelineProvider>
      <VideoEditorWithMask />
    </TimelineProvider>
  );
}

export default function VideoEditorPage() {
  return (
    <VideoStateProvider>
      <VideoRefsProvider>
        <VideoEditorWithTimeline />
      </VideoRefsProvider>
    </VideoStateProvider>
  );
}
