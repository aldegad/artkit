"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage, useAuth } from "@/shared/contexts";
import { HeaderContent, SaveToast, LoadingOverlay, Select, Scrollbar } from "@/shared/components";
import {
  ZoomInIcon,
  ZoomOutIcon,
  LockAspectIcon,
  UnlockAspectIcon,
  SquareExpandIcon,
  SquareFitIcon,
  CanvasExpandIcon,
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
  MaskControls,
  VideoSplitContainer,
  VideoFloatingWindows,
  VideoProjectListModal,
  registerVideoPanelComponent,
  clearVideoPanelComponents,
  VideoPreviewPanelContent,
  VideoTimelinePanelContent,
  clearVideoAutosave,
  SUPPORTED_VIDEO_FORMATS,
  SUPPORTED_IMAGE_FORMATS,
  SUPPORTED_AUDIO_FORMATS,
  TIMELINE,
  MASK_BRUSH,
  VideoPanModeToggle,
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
import { getVideoStorageProvider } from "@/domains/video/services/videoProjectStorage";
import { LayoutNode, isSplitNode, isPanelNode } from "@/shared/types/layout";
import { ASPECT_RATIOS, type AspectRatio } from "@/shared/types/aspectRatio";

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
    isSpacePanning,
    setIsSpacePanning,
    previewPreRenderEnabled,
    togglePreviewPreRender,
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
  } = useVideoLayout();

  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const editorRootRef = useRef<HTMLDivElement>(null);
  const [showExportModal, setShowExportModal] = useState(false);
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
    toggleLoop,
    selectClips,
    clearHistory,
    clearMaskHistory,
  });

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

  const hasContent = clips.length > 0;
  const selectedClip = selectedClipIds.length > 0
    ? clips.find((clip) => clip.id === selectedClipIds[0]) || null
    : null;
  const selectedAudioClip = selectedClip && selectedClip.type !== "image" ? selectedClip : null;
  const selectedVisualClip = selectedClip && selectedClip.type !== "audio" ? selectedClip : null;
  const isTimelineVisible = isPanelOpen("timeline");
  const canUndoAny = canUndo || canUndoMask;
  const canRedoAny = canRedo || canRedoMask;

  const { importFiles: importMediaFiles } = useMediaImport();

  // Menu handlers
  const handleNew = useCallback(async () => {
    if (window.confirm(t.newProjectConfirm)) {
      await clearVideoAutosave();
      window.location.reload();
    }
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
  });

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

  // Preview zoom (synced from PreviewCanvas viewport)
  const [previewZoom, setPreviewZoom] = useState(1);
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
      unsubscribe = api.onZoomChange((z) => setPreviewZoom(z));
    };

    attach();
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      unsubscribe?.();
    };
  }, [previewViewportRef]);
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

  const handlePreviewZoomIn = useCallback(() => {
    previewViewportRef.current?.zoomIn();
  }, [previewViewportRef]);

  const handlePreviewZoomOut = useCallback(() => {
    previewViewportRef.current?.zoomOut();
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
    timeline: t.timeline,
    previewVideoCache: t.previewVideoCache,
    resetLayout: t.resetLayout,
  };

  const toolbarTranslations = {
    select: t.select,
    selectDesc: t.selectDesc,
    transform: "Transform",
    transformDesc: "Scale and move clip content",
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
      ref={editorRootRef}
      data-video-editor-root=""
      className="h-full bg-background text-text-primary flex flex-col overflow-hidden overscroll-x-none relative"
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
            canUndo={canUndoAny}
            canRedo={canRedoAny}
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

        <div className="h-4 w-px bg-border-default" />

        {/* Preview zoom controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handlePreviewZoomOut}
            className="p-1 hover:bg-interactive-hover rounded transition-colors text-text-secondary hover:text-text-primary"
            title="Zoom out preview"
          >
            <ZoomOutIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handlePreviewFit}
            className="px-1 py-0.5 text-xs text-text-secondary hover:text-text-primary hover:bg-interactive-hover rounded transition-colors min-w-[40px] text-center"
            title="Fit to screen"
          >
            {Math.round(previewZoom * 100)}%
          </button>
          <button
            onClick={handlePreviewZoomIn}
            className="p-1 hover:bg-interactive-hover rounded transition-colors text-text-secondary hover:text-text-primary"
            title="Zoom in preview"
          >
            <ZoomInIcon className="w-4 h-4" />
          </button>
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
        <VideoPanModeToggle />
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
          compression: t.compression,
          backgroundColor: t.backgroundColor,
          compressionHighQuality: t.compressionHighQuality,
          compressionBalanced: t.compressionBalanced,
          compressionSmallFile: t.compressionSmallFile,
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
