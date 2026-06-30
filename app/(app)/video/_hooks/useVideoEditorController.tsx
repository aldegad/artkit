"use client";

import { useCallback, useMemo, useRef, type ChangeEvent } from "react";
import { useAuth, useLanguage } from "@/shared/contexts";
import { showErrorToast } from "@/shared/components";
import {
  SUPPORTED_AUDIO_FORMATS,
  SUPPORTED_IMAGE_FORMATS,
  SUPPORTED_VIDEO_FORMATS,
  useMask,
  useTimeline,
  useVideoExport,
  useVideoLayout,
  useVideoRefs,
  useVideoSave,
  useVideoState,
} from "@/domains/video";
import {
  analyzeGapInterpolationSelection,
  useCaptureFrameToImageLayer,
  useGapInterpolationActions,
  useMaskRestoreSync,
  useMediaImport,
  usePreviewViewportState,
  useVideoProjectLibrary,
  useSelectedClipAudioActions,
  useVideoClipboardActions,
  useVideoCropActions,
  useVideoEditActions,
  useVideoFileActions,
  useVideoInpaintActions,
  useVideoToolModeHandlers,
} from "@/domains/video/hooks";
import {
  createVideoMenuTranslations,
  createVideoToolbarTranslations,
} from "@/domains/video/utils/editorTranslations";
import { getVideoStorageProvider } from "@/domains/video/services/videoProjectStorage";
import { useAutoPauseOnHidden } from "./useAutoPauseOnHidden";
import { useCanvasOverlay } from "./useCanvasOverlay";
import { useMaskAutoStartFromSelection, useMaskEditing, useMaskToolAutoSwitch } from "./useMaskEditing";
import { useProjectSaveDetails } from "./useProjectSaveDetails";
import { useSelectedVideoClipState } from "./useSelectedVideoClipState";
import { useVideoEditorShortcuts } from "./useVideoEditorShortcuts";
import { useVideoExportDialog } from "./useVideoExportDialog";
import { useVideoInterpolationControls } from "./useVideoInterpolationControls";
import { useVideoPanelRegistration } from "./useVideoPanelRegistration";
import { useVideoPlaybackRange } from "./useVideoPlaybackRange";
import { useVideoViewControls } from "./useVideoViewControls";

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9-_ ]+/g, "").replace(/\s+/g, "-") || "untitled-project";
}

export function useVideoEditorController() {
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
  const { previewCanvasRef, previewViewportRef, inpaintMaskCanvasRef } = useVideoRefs();
  const {
    tracks,
    clips,
    viewState,
    setZoom,
    setScrollX,
    setViewState,
    addTrack,
    addImageClip,
    addCanvasOverlayClip,
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
  const { showExportModal, setShowExportModal, handleExportSettled } = useVideoExportDialog();
  const {
    videoInterpolationQuality,
    handleVideoInterpolationQualityChange,
  } = useVideoInterpolationControls();

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
    saveDialogState,
    requestProjectSaveDetails,
    closeSaveDialog,
    submitSaveDialog,
  } = useProjectSaveDetails(savedProjects);

  const masksArray = useMemo(() => Array.from(masksMap.values()), [masksMap]);
  const playbackRange = useVideoPlaybackRange({
    clips,
    projectDuration: project.duration,
    playback,
  });
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

  useVideoPanelRegistration();

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

  useMaskToolAutoSwitch({
    isEditingMask,
    toolMode,
    setToolMode,
  });

  const {
    selectedClip,
    selectedAudioClip,
    selectedVisualClip,
    selectedPositionKeyframeClip,
  } = useSelectedVideoClipState({
    clips,
    selectedClipIds,
    selectedPositionKeyframe,
    setSelectedPositionKeyframe,
  });

  const {
    selectedCanvasOverlayClip,
    editingCanvasOverlayClip,
    handleCreateCanvasOverlay,
    handleEditCanvasOverlay,
    handleCloseCanvasOverlayModal,
    handleSaveCanvasOverlay,
  } = useCanvasOverlay({
    clips,
    tracks,
    selectedVisualClip,
    projectCanvasSize: project.canvasSize,
    playbackCurrentTime: playback.currentTime,
    addTrack,
    addCanvasOverlayClip,
    saveToHistory,
    selectClips,
    updateClip,
  });

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
  const {
    isInpainting: isInpaintingClip,
    inpaintStatus: inpaintStatusLabel,
    canInpaint: canInpaintClip,
    clearInpaintRegion,
    handleInpaintClip,
  } = useVideoInpaintActions({
    selectedClip: selectedVisualClip,
    inpaintMaskCanvasRef,
    frameRate: project.frameRate,
    projectCanvasSize: project.canvasSize,
    isPlaying: playback.isPlaying,
    pause,
    saveToHistory,
    updateClip,
    translations: {
      selectVideoClip: t.videoInpaintSelectVideoClip,
      selectMask: t.videoInpaintSelectMask,
      unsupportedTransform: t.videoInpaintUnsupportedTransform,
      clipTooLong: t.videoInpaintClipTooLong,
      preparing: t.videoInpaintPreparing,
      loadingModel: t.videoInpaintLoadingModel,
      processing: t.videoInpaintProcessing,
      encoding: t.videoInpaintEncoding,
      applying: t.videoInpaintApplying,
      completed: t.videoInpaintCompleted,
      failed: t.videoInpaintFailed,
    },
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

  const {
    handleZoomIn,
    handleZoomOut,
    handleFitToScreen,
    handleToggleTimeline,
  } = useVideoViewControls({
    timelineZoom: viewState.zoom,
    projectDuration: project.duration,
    setZoom,
    setScrollX,
    layoutState,
    closeFloatingWindow,
    removePanel,
    addPanel,
    openFloatingWindow,
  });

  const {
    previewTransformState,
    previewZoom,
    setPreviewZoom,
    handlePreviewFit,
  } = usePreviewViewportState(previewViewportRef);

  const { clearSelectedMasks, handleAdjustMaskBrushSize } = useMaskEditing({
    toolMode,
    selectMasksForTimeline,
    brushSettings,
    setBrushSize,
  });
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

  useAutoPauseOnHidden({
    isPlaying: playback.isPlaying,
    pause,
  });

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

  useMaskAutoStartFromSelection({
    toolMode,
    isEditingMask,
    postRestorationRef,
    tryStartMaskEditFromSelection,
  });

  useVideoEditorShortcuts({
    rootRef: editorRootRef,
    selectedVisualClip,
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

  const menuTranslations = useMemo(() => createVideoMenuTranslations(t), [t]);
  const toolbarTranslations = useMemo(() => createVideoToolbarTranslations(t), [t]);
  const supportedMediaAccept = useMemo(
    () => [...SUPPORTED_VIDEO_FORMATS, ...SUPPORTED_IMAGE_FORMATS, ...SUPPORTED_AUDIO_FORMATS].join(","),
    [],
  );
  const defaultExportFileName = useMemo(() => sanitizeFileName(projectName), [projectName]);
  const hasContent = clips.length > 0;

  const handleMediaFileInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length > 0) {
      try {
        await importMediaFiles(files);
      } catch (error) {
        console.error("Media import failed:", error);
        showErrorToast(`${t.importFailed}: ${(error as Error).message}`);
      }
    }
    event.target.value = "";
  }, [importMediaFiles, t.importFailed]);

  return {
    t,
    editorRootRef,
    mediaFileInputRef,
    project,
    projectName,
    setProjectName,
    toolMode,
    selectedClipIds,
    selectedMaskIds,
    selectedPositionKeyframe,
    activeMaskId,
    cropAspectRatio,
    setCropAspectRatio,
    cropArea,
    lockCropAspect,
    setLockCropAspect,
    canvasExpandMode,
    setCanvasExpandMode,
    previewPreRenderEnabled,
    togglePreviewPreRender,
    previewQualityFirstEnabled,
    togglePreviewQualityFirst,
    isPanLocked,
    setIsPanLocked,
    saveDialogState,
    closeSaveDialog,
    submitSaveDialog,
    isAutosaveInitialized,
    isInpaintingClip,
    inpaintStatusLabel,
    isSaving,
    saveCount,
    saveProgress,
    handleNew,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleImportMedia,
    hasContent,
    isExporting,
    handleUndo,
    handleRedo,
    canUndoAny,
    canRedoAny,
    handleCut,
    handleCopy,
    handlePaste,
    handleDelete,
    selectedClip,
    hasClipboard,
    panelHeadersVisible,
    togglePanelHeaders,
    handleZoomIn,
    handleZoomOut,
    handleFitToScreen,
    handleToggleTimeline,
    isTimelineVisible,
    resetLayout,
    menuTranslations,
    toolbarTranslations,
    handleToolModeChange,
    handleInterpolateClipGap,
    gapInterpolationAnalysis,
    isInterpolatingGap,
    handleInpaintClip,
    canInpaintClip,
    clearInpaintRegion,
    previewZoom,
    setPreviewZoom,
    handlePreviewFit,
    handleCaptureFrameToImageLayer,
    isCapturingFrame,
    handleCreateCanvasOverlay,
    handleEditCanvasOverlay,
    selectedCanvasOverlayClip,
    handleCropWidthChange,
    handleCropHeightChange,
    handleExpandToSquare,
    handleFitToSquare,
    handleApplyCrop,
    handleClearCrop,
    handleSelectAllCrop,
    previewTransformState,
    handleSetTransformAspectRatio,
    handleApplyTransform,
    handleCancelTransform,
    selectedAudioClip,
    beginAudioAdjustment,
    endAudioAdjustment,
    handleToggleSelectedClipMute,
    handleSelectedClipVolumeChange,
    handleApplyCanvasSize,
    supportedMediaAccept,
    handleMediaFileInputChange,
    showInterpolationModal,
    setShowInterpolationModal,
    handleConfirmInterpolation,
    interpolationSteps,
    setInterpolationSteps,
    videoInterpolationQuality,
    handleVideoInterpolationQualityChange,
    gapInterpolationProgress,
    gapInterpolationStatus,
    isProjectListOpen,
    setIsProjectListOpen,
    savedProjects,
    currentProjectId,
    handleLoadProject,
    handleDeleteProject,
    storageInfo,
    isLoadingProject,
    loadProgress,
    projectListOperation,
    showExportModal,
    setShowExportModal,
    handleExport,
    defaultExportFileName,
    exportProgress,
    editingCanvasOverlayClip,
    handleCloseCanvasOverlayModal,
    handleSaveCanvasOverlay,
  };
}
