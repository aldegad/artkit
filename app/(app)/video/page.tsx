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
  SaveProjectModal,
  showErrorToast,
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
  VideoCanvasSizeEditor,
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
  SUPPORTED_VIDEO_FORMATS,
  SUPPORTED_IMAGE_FORMATS,
  SUPPORTED_AUDIO_FORMATS,
  TIMELINE,
  MASK_BRUSH,
  type Clip,
} from "@/domains/video";
import {
  useVideoKeyboardShortcuts,
  useMediaImport,
  useCaptureFrameToImageLayer,
  useVideoProjectLibrary,
  useVideoClipboardActions,
  useVideoCropActions,
  usePreviewViewportState,
  useVideoToolModeHandlers,
  useGapInterpolationActions,
  analyzeGapInterpolationSelection,
  useMaskRestoreSync,
  useVideoFileActions,
  useSelectedClipAudioActions,
  useVideoEditActions,
} from "@/domains/video/hooks";
import {
  getClipPositionKeyframes,
} from "@/domains/video/utils/clipTransformKeyframes";
import {
  createVideoMenuTranslations,
  createVideoToolbarTranslations,
} from "@/domains/video/utils/editorTranslations";
import { getVideoStorageProvider } from "@/domains/video/services/videoProjectStorage";
import { LayoutNode, isSplitNode, isPanelNode } from "@/shared/types/layout";
import { ASPECT_RATIOS, type AspectRatio } from "@/shared/types/aspectRatio";
import {
  type RifeInterpolationQuality,
} from "@/shared/ai/frameInterpolation";
import { readAISettings, updateAISettings } from "@/shared/ai/settings";
import { useHorizontalWheelCapture } from "@/shared/hooks";
import { useSaveProjectDialog } from "@/shared/hooks";
import { collectProjectGroupNames } from "@/shared/utils/projectGroups";

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

function findValidPositionKeyframeClip(
  clips: Clip[],
  selection: { clipId: string; keyframeId: string } | null
): Clip | null {
  if (!selection) return null;
  const clip = clips.find((candidate) => candidate.id === selection.clipId);
  if (!clip || clip.type === "audio") return null;

  const hasKeyframe = getClipPositionKeyframes(clip).some(
    (keyframe) => keyframe.id === selection.keyframeId
  );
  return hasKeyframe ? clip : null;
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
    projectGroup,
    setProject,
    setProjectName,
    setProjectGroup,
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
    previewQualityFirstEnabled,
    togglePreviewQualityFirst,
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
    setProjectGroup,
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

  const {
    dialogState: saveDialogState,
    requestSaveDetails,
    closeDialog: closeSaveDialog,
    submitDialog: submitSaveDialog,
  } = useSaveProjectDialog();
  const requestProjectSaveDetails = useCallback((request: {
    mode: "save" | "saveAs";
    name: string;
    projectGroup?: string;
  }) => {
    return requestSaveDetails({
      ...request,
      existingProjectGroups: collectProjectGroupNames(savedProjects),
    });
  }, [requestSaveDetails, savedProjects]);

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
    projectGroup,
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
    setProjectName,
    setProjectGroup,
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

  const { postRestorationRef } = useMaskRestoreSync({
    isAutosaveInitialized,
    projectMasks: project.masks,
    restoreMasks,
    masksMap,
    selectedMaskIds,
    selectMask,
    masksArray,
    setProject,
    projectRef,
  });

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
  const selectedPositionKeyframeClip = useMemo(
    () => findValidPositionKeyframeClip(clips, selectedPositionKeyframe),
    [clips, selectedPositionKeyframe]
  );

  useEffect(() => {
    if (selectedPositionKeyframe && !selectedPositionKeyframeClip) {
      setSelectedPositionKeyframe(null);
    }
  }, [selectedPositionKeyframe, selectedPositionKeyframeClip, setSelectedPositionKeyframe]);

  const gapInterpolationAnalysis = useMemo(
    () => analyzeGapInterpolationSelection(clips, selectedClipIds, project.frameRate),
    [clips, selectedClipIds, project.frameRate],
  );
  const {
    showInterpolationModal,
    setShowInterpolationModal,
    interpolationSteps,
    setInterpolationSteps,
    isInterpolatingGap,
    gapInterpolationProgress,
    gapInterpolationStatus,
    handleInterpolateClipGap,
    handleConfirmInterpolation,
  } = useGapInterpolationActions({
    analysis: gapInterpolationAnalysis,
    isPlaying: playback.isPlaying,
    pause,
    frameRate: project.frameRate,
    quality: videoInterpolationQuality,
    interpolationProgressLabel: t.interpolationProgress,
    savingLabel: t.saving,
    failedLabel: t.interpolationFailed,
    saveToHistory,
    addClips,
    selectClips,
  });
  const isTimelineVisible = isPanelOpen("timeline");
  const canUndoAny = canUndo || canUndoMask;
  const canRedoAny = canRedo || canRedoMask;

  const { importFiles: importMediaFiles } = useMediaImport();
  const {
    saveCount,
    handleNew,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleLoadProject,
    handleDeleteProject,
    handleImportMedia,
  } = useVideoFileActions({
    newLabel: t.new,
    newProjectConfirm: t.newProjectConfirm,
    cancelLabel: t.cancel,
    projectName,
    projectGroup,
    saveProject,
    saveAsProject,
    requestSaveDetails: requestProjectSaveDetails,
    openProjectList,
    loadProject,
    deleteProject,
    mediaFileInputRef,
  });

  const {
    handleUndo,
    handleRedo,
    handleDeleteSelectedPositionKeyframe,
  } = useVideoEditActions({
    toolMode,
    isEditingMask,
    activeMaskId,
    selectedMaskCount: selectedMaskIds.length,
    canUndoMask,
    canRedoMask,
    undoMask,
    redoMask,
    undo,
    redo,
    deselectAll,
    selectedPositionKeyframe,
    selectedPositionKeyframeClip,
    clearSelectedPositionKeyframe: () => setSelectedPositionKeyframe(null),
    saveToHistory,
    updateClip,
  });

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

  const {
    beginAudioAdjustment,
    endAudioAdjustment,
    handleToggleSelectedClipMute,
    handleSelectedClipVolumeChange,
  } = useSelectedClipAudioActions({
    selectedAudioClip,
    saveToHistory,
    updateClip,
  });

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

  const {
    previewTransformState,
    previewZoom,
    setPreviewZoom,
    handlePreviewFit,
  } = usePreviewViewportState(previewViewportRef);

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
  const handleApplyCanvasSize = useCallback((width: number, height: number) => {
    setProject({ ...project, canvasSize: { width, height } });
  }, [project, setProject]);

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

  const {
    tryStartMaskEditFromSelection,
    handleToolModeChange,
    handleStartTransformShortcut,
    handleApplyTransform,
    handleCancelTransform,
    handleSetTransformAspectRatio,
    handleNudgeTransform,
  } = useVideoToolModeHandlers({
    toolMode,
    setToolMode,
    selectedClipIds,
    clips,
    projectCanvasSize: project.canvasSize,
    playbackCurrentTime: playback.currentTime,
    startMaskEdit,
    isEditingMask,
    endMaskEdit,
    cropArea,
    setCropArea,
    previewViewportRef,
  });

  const handleStartTransformShortcutAction = useCallback(() => {
    handleStartTransformShortcut(Boolean(selectedVisualClip));
  }, [handleStartTransformShortcut, selectedVisualClip]);

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
    if (isEditingMask) return; // already editing
    tryStartMaskEditFromSelection();
  }, [toolMode, isEditingMask, tryStartMaskEditFromSelection]);


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
    handleStartTransformShortcut: handleStartTransformShortcutAction,
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
  useHorizontalWheelCapture({ rootRef: editorRootRef });

  const menuTranslations = useMemo(() => createVideoMenuTranslations(t), [t]);
  const toolbarTranslations = useMemo(() => createVideoToolbarTranslations(t), [t]);

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

      <SaveProjectModal
        isOpen={saveDialogState.isOpen}
        initialName={saveDialogState.initialName}
        initialProjectGroup={saveDialogState.initialProjectGroup}
        existingProjectGroups={saveDialogState.existingProjectGroups}
        isSaving={isSaving}
        onClose={closeSaveDialog}
        onSave={submitSaveDialog}
        translations={{
          title: saveDialogState.mode === "saveAs" ? t.saveAs : t.save,
          name: t.fileName,
          project: t.project,
          defaultProject: "default",
          newProject: `${t.newProject}...`,
          newProjectName: t.projectName,
          cancel: t.cancel,
          save: saveDialogState.mode === "saveAs" ? t.saveAs : t.save,
        }}
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
            onTogglePreviewQualityFirst={togglePreviewQualityFirst}
            previewQualityFirstEnabled={previewQualityFirstEnabled}
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
      <Scrollbar
        className="bg-surface-secondary border-b border-border-default shrink-0"
        overflow={{ x: "scroll", y: "hidden" }}
      >
        <div className="flex items-center gap-4 px-3 py-1.5 min-w-full w-max">
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
            <VideoCanvasSizeEditor
              canvasWidth={project.canvasSize.width}
              canvasHeight={project.canvasSize.height}
              onApplyCanvasSize={handleApplyCanvasSize}
            />
          </div>
        </div>
      </Scrollbar>

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
          project: t.project,
          allProjects: t.allProjects,
          defaultProject: "default",
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
