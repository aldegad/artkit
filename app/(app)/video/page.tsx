"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage, useAuth } from "@/shared/contexts";
import {
  HeaderContent,
  SaveToast,
  LoadingOverlay,
  Select,
  Scrollbar,
  CanvasCropControls,
  PanLockFloatingButton,
  confirmDialog,
  showErrorToast,
  showInfoToast,
} from "@/shared/components";
import {
  VolumeOnIcon,
  VolumeMutedIcon,
  UndoIcon,
  RedoIcon,
  VideoCameraIcon,
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
  VideoInterpolationModal,
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
  SUPPORTED_VIDEO_FORMATS,
  SUPPORTED_IMAGE_FORMATS,
  SUPPORTED_AUDIO_FORMATS,
  createImageClip,
  TIMELINE,
  MASK_BRUSH,
  type Clip,
  type SavedVideoProject,
  type VideoToolMode,
} from "@/domains/video";
import {
  useVideoKeyboardShortcuts,
  useMediaImport,
  useCaptureFrameToImageLayer,
  useVideoProjectLibrary,
  useVideoClipboardActions,
  useVideoCropActions,
} from "@/domains/video/hooks";
import {
  getClipPositionKeyframes,
  removeClipPositionKeyframeById,
} from "@/domains/video/utils/clipTransformKeyframes";
import { getVideoStorageProvider } from "@/domains/video/services/videoProjectStorage";
import { LayoutNode, isSplitNode, isPanelNode } from "@/shared/types/layout";
import { ASPECT_RATIOS, type AspectRatio } from "@/shared/types/aspectRatio";
import {
  interpolateFramesWithAI,
  type RifeInterpolationQuality,
} from "@/shared/ai/frameInterpolation";
import { readAISettings, updateAISettings } from "@/shared/ai/settings";

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9-_ ]+/g, "").replace(/\s+/g, "-") || "untitled-project";
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

const VIDEO_GAP_INTERPOLATION_MAX_STEPS = 180;
const VIDEO_GAP_INTERPOLATION_MIN_GAP = 0.0001;
const VIDEO_SEEK_EPSILON = 1 / 600;

type GapInterpolationIssue =
  | "select_two_visual_clips"
  | "same_track_required"
  | "gap_required"
  | "gap_blocked";

interface GapInterpolationAnalysis {
  ready: boolean;
  issue?: GapInterpolationIssue;
  firstClip?: Clip;
  secondClip?: Clip;
  gapDuration: number;
  suggestedSteps: number;
}

interface FrameSnapshot {
  dataUrl: string;
  size: { width: number; height: number };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateGapInterpolationSteps(gapDuration: number, frameRate: number): number {
  const fps = Math.max(1, Math.round(frameRate || 30));
  const estimated = Math.round(gapDuration * fps);
  return Math.max(1, Math.min(VIDEO_GAP_INTERPOLATION_MAX_STEPS, estimated));
}

function analyzeGapInterpolationSelection(
  clips: Clip[],
  selectedClipIds: string[],
  frameRate: number,
): GapInterpolationAnalysis {
  const selectedVisual = clips
    .filter((clip) => selectedClipIds.includes(clip.id) && clip.type !== "audio")
    .sort((a, b) => a.startTime - b.startTime);

  if (selectedVisual.length !== 2) {
    return { ready: false, issue: "select_two_visual_clips", gapDuration: 0, suggestedSteps: 0 };
  }

  const [firstClip, secondClip] = selectedVisual;
  if (firstClip.trackId !== secondClip.trackId) {
    return {
      ready: false,
      issue: "same_track_required",
      firstClip,
      secondClip,
      gapDuration: 0,
      suggestedSteps: 0,
    };
  }

  const firstEnd = firstClip.startTime + firstClip.duration;
  const gapDuration = secondClip.startTime - firstEnd;
  if (gapDuration <= VIDEO_GAP_INTERPOLATION_MIN_GAP) {
    return {
      ready: false,
      issue: "gap_required",
      firstClip,
      secondClip,
      gapDuration,
      suggestedSteps: 0,
    };
  }

  const selectedSet = new Set(selectedVisual.map((clip) => clip.id));
  const hasBlockingClip = clips.some((clip) => {
    if (clip.trackId !== firstClip.trackId) return false;
    if (selectedSet.has(clip.id)) return false;
    const clipEnd = clip.startTime + clip.duration;
    return clip.startTime < secondClip.startTime && clipEnd > firstEnd;
  });

  if (hasBlockingClip) {
    return {
      ready: false,
      issue: "gap_blocked",
      firstClip,
      secondClip,
      gapDuration,
      suggestedSteps: 0,
    };
  }

  return {
    ready: true,
    firstClip,
    secondClip,
    gapDuration,
    suggestedSteps: estimateGapInterpolationSteps(gapDuration, frameRate),
  };
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Failed to convert generated frame to blob.");
  }
  return response.blob();
}

async function captureVideoFrame(sourceUrl: string, sourceTime: number): Promise<FrameSnapshot> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  if (!sourceUrl.startsWith("blob:") && !sourceUrl.startsWith("data:")) {
    video.crossOrigin = "anonymous";
  }

  const waitForMetadata = async () => {
    if (video.readyState >= 1 && Number.isFinite(video.duration)) return;
    await new Promise<void>((resolve, reject) => {
      const onLoadedMetadata = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Failed to load video metadata for interpolation."));
      };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.addEventListener("error", onError);
      video.load();
    });
  };

  const seekTo = async (time: number) => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const clamped = clamp(time, 0, Math.max(0, duration - VIDEO_SEEK_EPSILON));
    if (Math.abs(video.currentTime - clamped) <= VIDEO_SEEK_EPSILON) return;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Video seek timeout during interpolation."));
      }, 5000);
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Failed to seek video frame for interpolation."));
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);
      video.currentTime = clamped;
    });
  };

  video.src = sourceUrl;

  try {
    await waitForMetadata();
    await seekTo(sourceTime);

    const width = video.videoWidth || 1;
    const height = video.videoHeight || 1;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create interpolation frame canvas.");
    }

    ctx.drawImage(video, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      size: { width, height },
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

async function captureClipBoundaryFrame(clip: Clip, boundary: "start" | "end", frameRate: number): Promise<FrameSnapshot> {
  if (clip.type === "audio") {
    throw new Error("Audio clips are not supported for visual interpolation.");
  }

  if (clip.type === "image") {
    return {
      dataUrl: clip.imageData || clip.sourceUrl,
      size: { ...clip.sourceSize },
    };
  }

  const fps = Math.max(1, frameRate || 30);
  const frameStep = 1 / fps;
  const sourceStart = clip.trimIn;
  const sourceEnd = Math.max(sourceStart, clip.trimOut - VIDEO_SEEK_EPSILON);
  const sourceTime = boundary === "end"
    ? clamp(sourceStart + clip.duration - frameStep, sourceStart, sourceEnd)
    : clamp(sourceStart, sourceStart, sourceEnd);

  return captureVideoFrame(clip.sourceUrl, sourceTime);
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
    selectedPositionKeyframe,
    setSelectedPositionKeyframe,
    selectClips,
    selectMasksForTimeline,
    deselectAll,
    togglePlay,
    pause,
    seek,
    setLoopRange,
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
    isSpacePanning,
    setIsSpacePanning,
    autoKeyframeEnabled,
    previewPreRenderEnabled,
    togglePreviewPreRender,
    isPanLocked,
    setIsPanLocked,
  } = useVideoState();
  const { previewCanvasRef, previewViewportRef } = useVideoRefs();
  const {
    tracks,
    clips,
    viewState,
    setZoom,
    setScrollX,
    setViewState,
    addTrack,
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
  const {
    startMaskEdit,
    isEditingMask,
    endMaskEdit,
    activeMaskId,
    deleteMask,
    duplicateMask,
    addMasks,
    deselectMask,
    selectMask,
    restoreMasks,
    masks: masksMap,
    updateMaskTime,
    canUndoMask,
    canRedoMask,
    undoMask,
    redoMask,
    clearMaskHistory,
    brushSettings,
    setBrushSize,
    hasMaskRegion,
    requestMaskRegionClear,
  } = useMask();
  const {
    layoutState,
    isPanelOpen,
    addPanel,
    removePanel,
    openFloatingWindow,
    closeFloatingWindow,
    resetLayout,
    panelHeadersVisible,
    togglePanelHeaders,
  } = useVideoLayout();

  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const editorRootRef = useRef<HTMLDivElement>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [videoInterpolationQuality, setVideoInterpolationQuality] = useState<RifeInterpolationQuality>(
    () => readAISettings().frameInterpolationQuality,
  );
  const [showInterpolationModal, setShowInterpolationModal] = useState(false);
  const [interpolationSteps, setInterpolationSteps] = useState(1);
  const [isInterpolatingGap, setIsInterpolatingGap] = useState(false);
  const [gapInterpolationProgress, setGapInterpolationProgress] = useState(0);
  const [gapInterpolationStatus, setGapInterpolationStatus] = useState("");
  const audioHistorySavedRef = useRef(false);
  const [saveCount, setSaveCount] = useState(0);

  const {
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
  } = useVideoProjectLibrary({
    storageProvider,
    deleteConfirmLabel: t.deleteConfirm || "Delete this project?",
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
  });

  const masksArray = useMemo(() => Array.from(masksMap.values()), [masksMap]);
  const playbackRange = useMemo(() => {
    const durationFromClips = clips.reduce(
      (max, clip) => Math.max(max, clip.startTime + clip.duration),
      0
    );
    const duration = Math.max(durationFromClips, project.duration, 0.001);
    const loopStart = Math.max(0, Math.min(playback.loopStart, duration));
    const hasRange = playback.loopEnd > loopStart + 0.001;
    const loopEnd = hasRange
      ? Math.max(loopStart + 0.001, Math.min(playback.loopEnd, duration))
      : duration;
    const hasCustomRange = hasRange && (loopStart > 0.001 || loopEnd < duration - 0.001);

    // Don't persist when range is effectively cleared (full range + loop off).
    if (!playback.loop && !hasCustomRange) return undefined;

    return {
      loop: playback.loop,
      loopStart,
      loopEnd,
    };
  }, [clips, project.duration, playback.loop, playback.loopStart, playback.loopEnd]);
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
    autoKeyframeEnabled,
    selectedClipIds,
    selectedMaskIds,
    previewCanvasRef,
    setCurrentProjectId,
    setSavedProjects,
    setStorageInfo,
    isInitialized: isAutosaveInitialized,
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

  const hasContent = clips.length > 0;
  const selectedClip = selectedClipIds.length > 0
    ? clips.find((clip) => clip.id === selectedClipIds[0]) || null
    : null;
  const selectedAudioClip = selectedClip && selectedClip.type !== "image" ? selectedClip : null;
  const selectedVisualClip = selectedClip && selectedClip.type !== "audio" ? selectedClip : null;

  useEffect(() => {
    if (!selectedPositionKeyframe) return;
    const clip = clips.find((candidate) => candidate.id === selectedPositionKeyframe.clipId);
    if (!clip || clip.type === "audio") {
      setSelectedPositionKeyframe(null);
      return;
    }
    const hasKeyframe = getClipPositionKeyframes(clip).some(
      (keyframe) => keyframe.id === selectedPositionKeyframe.keyframeId
    );
    if (!hasKeyframe) {
      setSelectedPositionKeyframe(null);
    }
  }, [clips, selectedPositionKeyframe, setSelectedPositionKeyframe]);

  const gapInterpolationAnalysis = useMemo(
    () => analyzeGapInterpolationSelection(clips, selectedClipIds, project.frameRate),
    [clips, selectedClipIds, project.frameRate],
  );
  const isTimelineVisible = isPanelOpen("timeline");
  const canUndoAny = canUndo || canUndoMask;
  const canRedoAny = canRedo || canRedoMask;

  const { importFiles: importMediaFiles } = useMediaImport();

  // Menu handlers
  const handleNew = useCallback(async () => {
    const shouldCreate = await confirmDialog({
      title: t.new || "New Project",
      message: t.newProjectConfirm,
      confirmLabel: t.new || "New",
      cancelLabel: t.cancel || "Cancel",
    });
    if (!shouldCreate) return;
    await clearVideoAutosave();
    window.location.reload();
  }, [t]);

  const handleOpen = useCallback(() => {
    openProjectList();
  }, [openProjectList]);

  const handleSave = useCallback(async () => {
    try {
      await saveProject();
      setSaveCount((c) => c + 1);
    } catch (error) {
      console.error("Failed to save project:", error);
      showErrorToast(`Save failed: ${(error as Error).message}`);
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
      showErrorToast(`Save failed: ${(error as Error).message}`);
    }
  }, [projectName, setProjectName, saveAsProject]);

  const handleLoadProject = useCallback(async (projectMeta: SavedVideoProject) => {
    await loadProject(projectMeta);
  }, [loadProject]);

  const handleDeleteProject = useCallback(async (id: string) => {
    await deleteProject(id);
  }, [deleteProject]);

  const handleImportMedia = useCallback(() => {
    mediaFileInputRef.current?.click();
  }, []);

  // Edit menu handlers
  const handleUndo = useCallback(() => {
    const shouldUndoMask = canUndoMask && (
      toolMode === "mask" ||
      isEditingMask ||
      activeMaskId !== null ||
      selectedMaskIds.length > 0
    );
    if (shouldUndoMask) {
      undoMask();
      return;
    }
    undo();
    deselectAll();
  }, [canUndoMask, toolMode, isEditingMask, activeMaskId, selectedMaskIds.length, undoMask, undo, deselectAll]);

  const handleRedo = useCallback(() => {
    const shouldRedoMask = canRedoMask && (
      toolMode === "mask" ||
      isEditingMask ||
      activeMaskId !== null ||
      selectedMaskIds.length > 0
    );
    if (shouldRedoMask) {
      redoMask();
      return;
    }
    redo();
    deselectAll();
  }, [canRedoMask, toolMode, isEditingMask, activeMaskId, selectedMaskIds.length, redoMask, redo, deselectAll]);

  const handleDeleteSelectedPositionKeyframe = useCallback((): boolean => {
    if (!selectedPositionKeyframe) return false;

    const clip = clips.find((candidate) => candidate.id === selectedPositionKeyframe.clipId);
    if (!clip || clip.type === "audio") {
      setSelectedPositionKeyframe(null);
      return true;
    }

    const hasKeyframe = getClipPositionKeyframes(clip).some(
      (keyframe) => keyframe.id === selectedPositionKeyframe.keyframeId
    );
    if (!hasKeyframe) {
      setSelectedPositionKeyframe(null);
      return true;
    }

    saveToHistory();
    const result = removeClipPositionKeyframeById(clip, selectedPositionKeyframe.keyframeId);
    if (result.removed) {
      updateClip(clip.id, result.updates);
    }
    setSelectedPositionKeyframe(null);
    return result.removed;
  }, [clips, saveToHistory, selectedPositionKeyframe, setSelectedPositionKeyframe, updateClip]);

  const {
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleDuplicate,
  } = useVideoClipboardActions({
    selectedClipIds,
    selectedMaskIds,
    clips,
    masksMap,
    tracks,
    playbackCurrentTime: playback.currentTime,
    clipboardRef,
    setHasClipboard,
    saveToHistory,
    removeClip,
    deselectAll,
    addClips,
    addMasks,
    selectClips,
    selectMasksForTimeline,
    duplicateMask,
    updateMaskTime,
    deleteMask,
    activeMaskId,
    isEditingMask,
    endMaskEdit,
    deleteSelectedPositionKeyframe: handleDeleteSelectedPositionKeyframe,
  });

  const handleInterpolateClipGap = useCallback(() => {
    if (isInterpolatingGap) return;

    if (!gapInterpolationAnalysis.ready || !gapInterpolationAnalysis.firstClip || !gapInterpolationAnalysis.secondClip) {
      switch (gapInterpolationAnalysis.issue) {
        case "same_track_required":
          showInfoToast("Select 2 clips on the same track.");
          break;
        case "gap_required":
          showInfoToast("No empty gap between selected clips.");
          break;
        case "gap_blocked":
          showInfoToast("The gap is occupied by another clip.");
          break;
        default:
          showInfoToast("Select exactly 2 visual clips for interpolation.");
          break;
      }
      return;
    }

    setInterpolationSteps(gapInterpolationAnalysis.suggestedSteps);
    setShowInterpolationModal(true);
  }, [isInterpolatingGap, gapInterpolationAnalysis]);

  const handleConfirmInterpolation = useCallback(async () => {
    if (!gapInterpolationAnalysis.ready || !gapInterpolationAnalysis.firstClip || !gapInterpolationAnalysis.secondClip) return;

    const { firstClip, secondClip, gapDuration } = gapInterpolationAnalysis;
    setShowInterpolationModal(false);

    if (playback.isPlaying) {
      pause();
    }

    setIsInterpolatingGap(true);
    setGapInterpolationProgress(0);
    setGapInterpolationStatus(t.interpolationProgress || "Interpolating frames");

    try {
      const [fromFrame, toFrame] = await Promise.all([
        captureClipBoundaryFrame(firstClip, "end", project.frameRate),
        captureClipBoundaryFrame(secondClip, "start", project.frameRate),
      ]);

      const outputSize = {
        width: Math.max(fromFrame.size.width, toFrame.size.width),
        height: Math.max(fromFrame.size.height, toFrame.size.height),
      };

      const generatedFrames = await interpolateFramesWithAI({
        fromImageData: fromFrame.dataUrl,
        toImageData: toFrame.dataUrl,
        steps: interpolationSteps,
        quality: videoInterpolationQuality,
        onProgress: (progress, status) => {
          setGapInterpolationProgress(Math.max(0, Math.min(90, progress)));
          setGapInterpolationStatus(status || (t.interpolationProgress || "Interpolating frames"));
        },
      });

      if (generatedFrames.length === 0) {
        throw new Error("No interpolation frames generated.");
      }

      setGapInterpolationProgress(92);
      setGapInterpolationStatus(t.saving || "Saving...");

      const createdClips: Clip[] = [];
      const persistTasks: Promise<void>[] = [];
      const frameDuration = gapDuration / generatedFrames.length;
      let nextStart = firstClip.startTime + firstClip.duration;

      for (let i = 0; i < generatedFrames.length; i++) {
        const imageData = generatedFrames[i];
        const blob = await dataUrlToBlob(imageData);
        const sourceUrl = URL.createObjectURL(blob);
        const duration = i === generatedFrames.length - 1
          ? Math.max(VIDEO_GAP_INTERPOLATION_MIN_GAP, secondClip.startTime - nextStart)
          : frameDuration;

        const clip = createImageClip(
          firstClip.trackId,
          sourceUrl,
          outputSize,
          nextStart,
          duration,
        );
        clip.name = `${firstClip.name} • AI ${i + 1}/${generatedFrames.length}`;
        clip.imageData = imageData;
        createdClips.push(clip);
        nextStart += duration;

        persistTasks.push(
          saveMediaBlob(clip.id, blob).catch((error) => {
            console.error("Failed to save interpolated media blob:", error);
          })
        );
      }

      saveToHistory();
      addClips(createdClips);
      selectClips(createdClips.map((clip) => clip.id));

      await Promise.all(persistTasks);

      setGapInterpolationProgress(100);
      setGapInterpolationStatus("Done");
    } catch (error) {
      console.error("Video gap interpolation failed:", error);
      setGapInterpolationStatus("Failed");
      showErrorToast(t.interpolationFailed || "Frame interpolation failed. Please try again.");
    } finally {
      setIsInterpolatingGap(false);
      window.setTimeout(() => {
        setGapInterpolationProgress(0);
        setGapInterpolationStatus("");
      }, 1500);
    }
  }, [
    gapInterpolationAnalysis,
    playback.isPlaying,
    pause,
    interpolationSteps,
    videoInterpolationQuality,
    t.interpolationProgress,
    t.saving,
    t.interpolationFailed,
    project.frameRate,
    saveToHistory,
    addClips,
    selectClips,
  ]);

  const beginAudioAdjustment = useCallback(() => {
    if (audioHistorySavedRef.current) return;
    saveToHistory();
    audioHistorySavedRef.current = true;
  }, [saveToHistory]);

  const endAudioAdjustment = useCallback(() => {
    audioHistorySavedRef.current = false;
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

  const {
    handleSelectAllCrop,
    handleClearCrop,
    handleCropWidthChange,
    handleCropHeightChange,
    handleExpandToSquare,
    handleFitToSquare,
    handleApplyCrop,
  } = useVideoCropActions({
    cropArea,
    lockCropAspect,
    clips,
    project,
    setProject,
    updateClip,
    saveToHistory,
    setCropArea,
    setCanvasExpandMode,
  });

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

  // Preview transform state (synced from PreviewCanvas viewport)
  const [previewTransformState, setPreviewTransformState] = useState<{
    isActive: boolean;
    clipId: string | null;
    aspectRatio: AspectRatio;
  }>({
    isActive: false,
    clipId: null,
    aspectRatio: "free",
  });
  const previousToolModeRef = useRef<VideoToolMode | null>(null);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let rafId: number | null = null;

    const attach = () => {
      const api = previewViewportRef.current;
      if (!api) {
        rafId = requestAnimationFrame(attach);
        return;
      }
      unsubscribe = api.onTransformChange((next) => setPreviewTransformState(next));
    };

    attach();
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      unsubscribe?.();
    };
  }, [previewViewportRef]);

  // Preview zoom state (synced from PreviewCanvas viewport)
  const [previewZoom, setPreviewZoomState] = useState(1);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let rafId: number | null = null;

    const attach = () => {
      const api = previewViewportRef.current;
      if (!api) {
        rafId = requestAnimationFrame(attach);
        return;
      }
      unsubscribe = api.onZoomChange((z) => setPreviewZoomState(z));
    };

    attach();
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      unsubscribe?.();
    };
  }, [previewViewportRef]);

  const setPreviewZoom = useCallback((zoomOrFn: number | ((z: number) => number)) => {
    const api = previewViewportRef.current;
    if (!api) return;
    const next = typeof zoomOrFn === "function" ? zoomOrFn(api.getZoom()) : zoomOrFn;
    api.setZoom(next);
  }, [previewViewportRef]);

  const handlePreviewFit = useCallback(() => {
    previewViewportRef.current?.fitToContainer();
  }, [previewViewportRef]);

  const clearSelectedMasks = useCallback(() => {
    selectMasksForTimeline([]);
  }, [selectMasksForTimeline]);
  const { isCapturingFrame, captureFrameToImageLayer: handleCaptureFrameToImageLayer } = useCaptureFrameToImageLayer({
    previewViewportRef,
    currentTime: playback.currentTime,
    canvasSize: project.canvasSize,
    tracks,
    selectedTrackId: selectedVisualClip?.trackId ?? null,
    addTrack,
    addImageClip,
    saveToHistory,
    selectClips,
    clearSelectedMasks,
  });
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

  const handleVideoInterpolationQualityChange = useCallback((quality: RifeInterpolationQuality) => {
    setVideoInterpolationQuality(quality);
    updateAISettings({ frameInterpolationQuality: quality });
  }, []);


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
    if (mode === "transform" && toolMode !== "transform" && previousToolModeRef.current === null) {
      previousToolModeRef.current = toolMode;
    }
    if (mode !== "transform" && toolMode === "transform") {
      previousToolModeRef.current = null;
    }

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
  }, [selectedClipIds, clips, startMaskEdit, setToolMode, cropArea, setCropArea, project.canvasSize, playback.currentTime, isEditingMask, endMaskEdit, toolMode]);

  const handleStartTransformShortcut = useCallback(() => {
    if (!selectedVisualClip) return;
    if (toolMode !== "transform") {
      previousToolModeRef.current = toolMode;
      handleToolModeChange("transform");
      return;
    }
    previewViewportRef.current?.startTransformForSelection();
  }, [selectedVisualClip, toolMode, handleToolModeChange, previewViewportRef]);

  const handleApplyTransform = useCallback(() => {
    previewViewportRef.current?.applyTransform();
    if (previousToolModeRef.current) {
      setToolMode(previousToolModeRef.current);
      previousToolModeRef.current = null;
    } else {
      setToolMode("select");
    }
  }, [previewViewportRef, setToolMode]);

  const handleCancelTransform = useCallback(() => {
    previewViewportRef.current?.cancelTransform();
    if (previousToolModeRef.current) {
      setToolMode(previousToolModeRef.current);
      previousToolModeRef.current = null;
    } else {
      setToolMode("select");
    }
  }, [previewViewportRef, setToolMode]);

  const handleSetTransformAspectRatio = useCallback((ratio: AspectRatio) => {
    previewViewportRef.current?.setTransformAspectRatio(ratio);
  }, [previewViewportRef]);

  const handleNudgeTransform = useCallback((dx: number, dy: number) => {
    return previewViewportRef.current?.nudgeTransform(dx, dy) ?? false;
  }, [previewViewportRef]);

  const handleAdjustMaskBrushSize = useCallback((delta: number) => {
    if (toolMode !== "mask") return;
    const nextSize = Math.max(
      MASK_BRUSH.MIN_SIZE,
      Math.min(MASK_BRUSH.MAX_SIZE, brushSettings.size + delta),
    );
    if (nextSize === brushSettings.size) return;
    setBrushSize(nextSize);
  }, [toolMode, brushSettings.size, setBrushSize]);

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
    isTransformActive: previewTransformState.isActive,
    handleStartTransformShortcut,
    handleApplyTransform,
    handleCancelTransform,
    handleNudgeTransform,
    activeMaskId,
    deselectMask,
    isEditingMask,
    endMaskEdit,
    hasMaskRegion,
    clearMaskRegion: requestMaskRegionClear,
    adjustMaskBrushSize: handleAdjustMaskBrushSize,
    isSpacePanning,
    setIsSpacePanning,
  });

  // Prevent browser history swipe gestures while preserving editor-local horizontal scroll.
  useEffect(() => {
    const root = editorRootRef.current;
    if (!root) return;

    const isHorizontallyScrollable = (el: HTMLElement): boolean => {
      if (el.scrollWidth <= el.clientWidth + 1) return false;
      const overflowX = window.getComputedStyle(el).overflowX;
      return overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay";
    };

    const findHorizontalScrollContainer = (start: HTMLElement): HTMLElement | null => {
      let node: HTMLElement | null = start;
      while (node && node !== root) {
        if (isHorizontallyScrollable(node)) return node;
        node = node.parentElement;
      }
      return isHorizontallyScrollable(root) ? root : null;
    };

    const handleWheelCapture = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !root.contains(target)) return;

      const scrollContainer = findHorizontalScrollContainer(target);
      if (scrollContainer) {
        scrollContainer.scrollLeft += event.deltaX;
      }

      event.preventDefault();
    };

    document.addEventListener("wheel", handleWheelCapture, { passive: false, capture: true });
    return () => {
      document.removeEventListener("wheel", handleWheelCapture, { capture: true });
    };
  }, []);

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
    panelHeaders: t.panelHeaders,
    timeline: t.timeline,
    previewVideoCache: t.previewVideoCache,
    resetLayout: t.resetLayout,
  };

  const toolbarTranslations = {
    select: t.select,
    selectDesc: t.selectDesc,
    transform: "Transform",
    transformDesc: "Scale and move clip content",
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
    frameInterpolation: t.frameInterpolation,
    frameInterpolationDescription: t.frameInterpolationDescription,
    delete: t.delete,
    fitToScreen: t.fitToScreen,
  };

  return (
    <div
      ref={editorRootRef}
      data-video-editor-root=""
      className="h-full bg-background text-text-primary flex flex-col overflow-hidden overscroll-x-none relative"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Loading overlay during autosave restore */}
      <LoadingOverlay isLoading={!isAutosaveInitialized} message={t.loading || "Loading..."} />

      <SaveToast
        isSaving={isSaving}
        saveCount={saveCount}
        savingLabel={
          saveProgress
            ? `${t.saving || "Saving…"} (${saveProgress.current}/${Math.max(1, saveProgress.total)})`
            : (t.saving || "Saving…")
        }
        savedLabel={t.saved || "Saved"}
        progress={saveProgress ? {
          current: saveProgress.current,
          total: Math.max(1, saveProgress.total),
          detail: saveProgress.clipName,
        } : null}
      />

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
            canUndo={canUndoAny}
            canRedo={canRedoAny}
            onCut={handleCut}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onDelete={handleDelete}
            hasSelection={selectedClipIds.length > 0 || selectedMaskIds.length > 0 || !!selectedPositionKeyframe}
            hasClipboard={hasClipboard}
            panelHeadersVisible={panelHeadersVisible}
            onTogglePanelHeaders={togglePanelHeaders}
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
          onInterpolateGap={handleInterpolateClipGap}
          canInterpolateGap={gapInterpolationAnalysis.ready}
          isInterpolatingGap={isInterpolatingGap}
          onDelete={handleDelete}
          hasSelection={selectedClipIds.length > 0 || selectedMaskIds.length > 0 || !!activeMaskId || !!selectedPositionKeyframe}
          previewZoom={previewZoom}
          setPreviewZoom={setPreviewZoom}
          onPreviewFit={handlePreviewFit}
          translations={toolbarTranslations}
        />

        <div className="flex items-center gap-0.5 bg-surface-secondary rounded p-0.5">
          <button
            onClick={handleUndo}
            disabled={!canUndoAny}
            className="p-1 hover:bg-interactive-hover disabled:opacity-30 rounded transition-colors"
            title={`${t.undo} (Ctrl+Z)`}
          >
            <UndoIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedoAny}
            className="p-1 hover:bg-interactive-hover disabled:opacity-30 rounded transition-colors"
            title={`${t.redo} (Ctrl+Shift+Z)`}
          >
            <RedoIcon className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border-default mx-0.5" />
          <button
            onClick={handleCaptureFrameToImageLayer}
            disabled={isCapturingFrame}
            className="p-1 hover:bg-interactive-hover disabled:opacity-30 rounded transition-colors"
            title="Capture current frame to image layer"
          >
            <VideoCameraIcon className="w-4 h-4" />
          </button>
        </div>

        {toolMode === "crop" && (
          <CanvasCropControls
            cropAspectRatio={cropAspectRatio}
            onCropAspectRatioChange={(ratio) => setCropAspectRatio(ratio)}
            cropArea={cropArea}
            onCropWidthChange={handleCropWidthChange}
            onCropHeightChange={handleCropHeightChange}
            lockCropAspect={lockCropAspect}
            onToggleLockCropAspect={() => setLockCropAspect(!lockCropAspect)}
            onExpandToSquare={handleExpandToSquare}
            onFitToSquare={handleFitToSquare}
            canvasExpandMode={canvasExpandMode}
            onToggleCanvasExpandMode={() => setCanvasExpandMode(!canvasExpandMode)}
            onSelectAllCrop={handleSelectAllCrop}
            onApplyCrop={handleApplyCrop}
            onClearCrop={handleClearCrop}
          />
        )}

        {toolMode === "transform" && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary">Ratio:</span>
              <Select
                value={previewTransformState.aspectRatio}
                onChange={(value) => handleSetTransformAspectRatio(value as AspectRatio)}
                options={ASPECT_RATIOS.map((r) => ({ value: r.value, label: r.label }))}
                size="sm"
              />
            </div>
            <span className="text-xs text-text-tertiary">
              {previewTransformState.isActive
                ? "Drag handles to resize. Shift: keep ratio, Alt: from center"
                : "Select a visual clip to transform"}
            </span>
            {previewTransformState.isActive && (
              <>
                <div className="w-px h-4 bg-border-default" />
                <button
                  onClick={handleApplyTransform}
                  className="px-1.5 py-0.5 text-xs bg-accent-primary text-white hover:bg-accent-primary/90 rounded transition-colors font-medium"
                >
                  Apply
                </button>
                <button
                  onClick={handleCancelTransform}
                  className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
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
              showErrorToast(`${t.importFailed}: ${(error as Error).message}`);
            }
          }
          e.target.value = "";
        }}
      />

      <VideoInterpolationModal
        open={showInterpolationModal}
        onClose={() => setShowInterpolationModal(false)}
        onConfirm={handleConfirmInterpolation}
        gapDuration={gapInterpolationAnalysis.gapDuration}
        suggestedSteps={gapInterpolationAnalysis.suggestedSteps}
        steps={interpolationSteps}
        quality={videoInterpolationQuality}
        onStepsChange={setInterpolationSteps}
        onQualityChange={handleVideoInterpolationQualityChange}
        isInterpolating={isInterpolatingGap}
        progress={gapInterpolationProgress}
        status={gapInterpolationStatus}
        translations={{
          frameInterpolation: t.frameInterpolation,
          frameInterpolationDescription: t.frameInterpolationDescription,
          interpolationSteps: t.interpolationSteps,
          interpolationQuality: t.interpolationQuality,
          qualityFast: t.interpolationQualityFast,
          qualityHigh: t.interpolationQualityHigh,
          qualityFastHint: t.interpolationQualityFastHint,
          qualityHighHint: t.interpolationQualityHighHint,
          estimatedFrames: t.interpolationEstimatedFrames,
          firstRunDownload: t.firstRunDownload,
          cancel: t.cancel,
          generate: t.confirm,
        }}
      />

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
          compression: t.compression,
          backgroundColor: t.backgroundColor,
          compressionHighQuality: t.compressionHighQuality,
          compressionBalanced: t.compressionBalanced,
          compressionSmallFile: t.compressionSmallFile,
        }}
      />

      <PanLockFloatingButton
        isPanLocked={isPanLocked}
        onTogglePanLock={() => setIsPanLocked(!isPanLocked)}
        storageKey="artkit.video.pan-toggle-position-v1"
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
