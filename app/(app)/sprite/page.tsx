"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import {
  EditorProvider,
  useEditorImage,
  useEditorFramesMeta,
  useEditorTools,
  useEditorBrush,
  useEditorViewport,
  useEditorAnimation,
  useEditorHistory,
  useEditorProject,
  useEditorWindows,
  useEditorTracks,
  useEditorClipboard,
  useLayout,
  LayoutProvider,
  SplitView,
  SpriteSheetImportModal,
  SpriteFrame,
  SpriteTopToolbar,
  SpriteToolOptionsBar,
  useFrameBackgroundRemoval,
  useFrameFill,
  useFrameInterpolation,
  useSpriteKeyboardShortcuts,
  FrameBackgroundRemovalModals,
  FrameInterpolationModals,
  SpriteExportModal,
  useSpriteExport,
  useSpriteProjectFileActions,
  useSpriteProjectSync,
  useSpriteExportActions,
  useSpriteCropActions,
  useSpriteResampleActions,
} from "@/domains/sprite";
import { useSpriteTrackStore, useSpriteViewportStore } from "@/domains/sprite/stores";
import type { RifeInterpolationQuality } from "@/shared/utils/rifeInterpolation";
import type { BackgroundRemovalQuality } from "@/shared/ai/backgroundRemoval";
import SpriteMenuBar from "@/domains/sprite/components/SpriteMenuBar";
import VideoImportModal from "@/domains/sprite/components/VideoImportModal";
import SpriteProjectListModal from "@/domains/sprite/components/SpriteProjectListModal";
import { useLanguage, useAuth } from "@/shared/contexts";
import {
  HeaderContent,
  SaveToast,
  LoadingOverlay,
  PanLockFloatingButton,
} from "@/shared/components";
import { SyncDialog } from "@/shared/components/app/auth";
import {
  getSpriteStorageProvider,
} from "@/domains/sprite/services/projectStorage";
import { type SpriteExportFrameSize } from "@/domains/sprite/utils/export";

// ============================================
// Main Editor Component
// ============================================

function SpriteEditorMain() {
  const { user } = useAuth();
  const { imageSrc, setImageSrc, imageSize, setImageSize, imageRef } = useEditorImage();
  const {
    frames,
    setFrames,
    nextFrameId,
    setNextFrameId,
    selectedFrameId,
    setSelectedFrameId,
    selectedFrameIds,
    setSelectedFrameIds,
    selectedPointIndex,
  } = useEditorFramesMeta();
  const {
    toolMode,
    setSpriteToolMode,
    setCurrentPoints,
    setIsSpacePressed,
    cropArea,
    setCropArea,
    cropAspectRatio,
    setCropAspectRatio,
    lockCropAspect,
    setLockCropAspect,
    canvasExpandMode,
    setCanvasExpandMode,
    magicWandTolerance,
    setMagicWandTolerance,
    magicWandFeather,
    setMagicWandFeather,
    magicWandSelectionMode,
    setMagicWandSelectionMode,
    isPanLocked,
    setIsPanLocked,
  } = useEditorTools();
  const {
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    brushHardness,
    setBrushHardness,
    activePreset,
    setActivePreset,
    presets,
    pressureEnabled,
    setPressureEnabled,
  } = useEditorBrush();
  const { setScale, setZoom, setPan } = useEditorViewport();
  const { fps } = useEditorAnimation();
  const animPreviewZoom = useSpriteViewportStore((s) => s.animPreviewZoom);
  const animPreviewVpApi = useSpriteViewportStore((s) => s._animPreviewVpApi);
  const { undo, redo, canUndo, canRedo, pushHistory } = useEditorHistory();
  const { projectName, setProjectName, savedProjects, setSavedSpriteProjects, currentProjectId, setCurrentProjectId, newProject, isAutosaveLoading } = useEditorProject();
  const {
    isProjectListOpen,
    setIsProjectListOpen,
    isSpriteSheetImportOpen,
    setIsSpriteSheetImportOpen,
    isVideoImportOpen,
    setIsVideoImportOpen,
    pendingVideoFile,
    setPendingVideoFile,
    canvasSize,
    setCanvasSize,
  } = useEditorWindows();
  const { tracks, addTrack, restoreTracks } = useEditorTracks();
  const { copyFrame, pasteFrame } = useEditorClipboard();
  const { resetLayout, panelHeadersVisible, togglePanelHeaders } = useLayout();

  // Export
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [detectedSourceFrameSize, setDetectedSourceFrameSize] = useState<SpriteExportFrameSize | null>(null);
  const { isExporting, exportProgress, exportMp4, startProgress, endProgress } = useSpriteExport();

  // Panel visibility states
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);

  // Video import modal state is now in the UI store (pendingVideoFile, isVideoImportOpen)

  // Background removal state
  const [showBgRemovalConfirm, setShowBgRemovalConfirm] = useState(false);
  const [bgRemovalQuality, setBgRemovalQuality] = useState<BackgroundRemovalQuality>("balanced");
  const [showFrameInterpolationConfirm, setShowFrameInterpolationConfirm] = useState(false);
  const [interpolationSteps, setInterpolationSteps] = useState(1);
  const [interpolationQuality, setInterpolationQuality] = useState<RifeInterpolationQuality>("fast");

  // File input ref for menu-triggered image import
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { t } = useLanguage();
  const storageProvider = useMemo(() => getSpriteStorageProvider(user), [user]);

  // Background removal hook
  const {
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    handleRemoveBackground,
  } = useFrameBackgroundRemoval({
    frames,
    getCurrentFrameIndex: () => useSpriteTrackStore.getState().currentFrameIndex,
    selectedFrameIds,
    setFrames,
    pushHistory,
    quality: bgRemovalQuality,
    translations: {
      backgroundRemovalFailed: t.backgroundRemovalFailed,
      selectFrameForBgRemoval: t.selectFrameForBgRemoval,
      frameImageNotFound: t.frameImageNotFound,
      processingFrameProgress: t.processingFrameProgress,
    },
  });

  const { handleFillFrames } = useFrameFill({
    frames,
    selectedFrameIds,
    getCurrentFrameIndex: () => useSpriteTrackStore.getState().currentFrameIndex,
    setFrames,
    pushHistory,
    fillColor: brushColor,
    frameSize: canvasSize ?? imageSize ?? null,
    translations: {
      noFrameToFill: t.noFrames || "No frame available to fill.",
    },
  });

  const {
    isInterpolating,
    interpolationProgress,
    interpolationStatus,
    interpolationPairCount,
    handleInterpolateFrames,
  } = useFrameInterpolation({
    frames,
    nextFrameId,
    selectedFrameIds,
    setFrames,
    setNextFrameId,
    setSelectedFrameId,
    setSelectedFrameIds,
    pushHistory,
    translations: {
      frameInterpolation: t.frameInterpolation,
      interpolationFailed: t.interpolationFailed,
      selectFramesForInterpolation: t.selectFramesForInterpolation,
      frameImageNotFound: t.frameImageNotFound,
      interpolationProgress: t.interpolationProgress,
    },
  });

  // Image upload handler - sets as main sprite image
  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;

        setImageSrc(src);
        setCurrentPoints([]);
        setFrames((prev) => prev.map((frame) => ({ ...frame, points: [] })));

        const img = new Image();
        img.onload = () => {
          setImageSize({ width: img.width, height: img.height });
          imageRef.current = img;

          const maxWidth = 900;
          const newScale = Math.min(maxWidth / img.width, 1);
          setScale(newScale);
          setZoom(1);
          setPan({ x: 0, y: 0 });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);

      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [setImageSrc, setImageSize, imageRef, setScale, setZoom, setPan, setCurrentPoints, setFrames],
  );

  // Import sprite sheet frames → new track
  const handleSpriteSheetImport = useCallback(
    (importedFrames: Omit<SpriteFrame, "id">[]) => {
      if (importedFrames.length === 0) return;

      pushHistory();

      const newFrames = importedFrames.map((frame, idx) => ({
        ...frame,
        id: nextFrameId + idx,
      }));

      addTrack("Sheet Import", newFrames as SpriteFrame[]);
      setNextFrameId((prev) => prev + importedFrames.length);
    },
    [nextFrameId, setNextFrameId, pushHistory, addTrack],
  );

  // Import video frames → new track
  const handleVideoImport = useCallback(
    (importedFrames: Omit<SpriteFrame, "id">[]) => {
      if (importedFrames.length === 0) return;

      pushHistory();

      const newFrames = importedFrames.map((frame, idx) => ({
        ...frame,
        id: nextFrameId + idx,
      }));

      addTrack("Video Import", newFrames as SpriteFrame[]);
      setNextFrameId((prev) => prev + importedFrames.length);
      setIsVideoImportOpen(false);
      setPendingVideoFile(null);
    },
    [nextFrameId, setNextFrameId, pushHistory, addTrack, setIsVideoImportOpen, setPendingVideoFile],
  );

  // Helper: get all frames across all tracks
  const allFrames = tracks.flatMap((t) => t.frames);
  const firstFrameImage = allFrames.find((f) => f.imageData)?.imageData;
  const hasRenderableFrames = tracks.length > 0 && allFrames.some((f) => f.imageData);
  const {
    isSaving,
    saveCount,
    saveProgress,
    isProjectLoading,
    loadProgress,
    storageInfo,
    refreshProjects,
    saveProject,
    saveProjectAs,
    loadProject,
    deleteProject,
    handleNewProject,
  } = useSpriteProjectFileActions({
    storageProvider,
    projectName,
    currentProjectId,
    imageSrc,
    firstFrameImage,
    imageSize,
    canvasSize,
    tracks,
    allFrames,
    nextFrameId,
    fps,
    framesCount: frames.length,
    setSavedSpriteProjects,
    setCurrentProjectId,
    setProjectName,
    setImageSrc,
    setImageSize,
    setCanvasSize,
    restoreTracks,
    setCurrentPoints,
    imageRef,
    setScale,
    setIsProjectListOpen,
    newProject,
    t: {
      enterProjectName: t.enterProjectName,
      saveFailed: t.saveFailed,
      deleteConfirm: t.deleteConfirm,
      deleteFailed: t.deleteFailed,
      newLabel: t.new || "New",
      newProjectConfirm: t.newProjectConfirm,
      cancelLabel: t.cancel || "Cancel",
    },
  });
  const {
    showSyncDialog,
    localProjectCount,
    cloudProjectCount,
    handleKeepCloud,
    handleKeepLocal,
    handleCancelSync,
  } = useSpriteProjectSync({
    user,
    refreshProjects,
  });

  useEffect(() => {
    if (imageSize.width > 0 && imageSize.height > 0) {
      setDetectedSourceFrameSize({
        width: Math.floor(imageSize.width),
        height: Math.floor(imageSize.height),
      });
      return;
    }

    if (!firstFrameImage) {
      setDetectedSourceFrameSize(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.width <= 0 || img.height <= 0) {
        setDetectedSourceFrameSize(null);
        return;
      }
      setDetectedSourceFrameSize({
        width: Math.floor(img.width),
        height: Math.floor(img.height),
      });
    };
    img.onerror = () => {
      if (!cancelled) setDetectedSourceFrameSize(null);
    };
    img.src = firstFrameImage;

    return () => {
      cancelled = true;
    };
  }, [imageSize.width, imageSize.height, firstFrameImage]);

  const cropBaseSize = useMemo(() => {
    if (canvasSize) return canvasSize;
    if (detectedSourceFrameSize) return detectedSourceFrameSize;
    if (imageSize.width > 0 && imageSize.height > 0) {
      return {
        width: Math.floor(imageSize.width),
        height: Math.floor(imageSize.height),
      };
    }
    return null;
  }, [canvasSize, detectedSourceFrameSize, imageSize.width, imageSize.height]);
  const {
    handleSelectAllCrop,
    handleClearCrop,
    handleCropWidthChange,
    handleCropHeightChange,
    handleExpandToSquare,
    handleFitToSquare,
    handleApplyCrop,
  } = useSpriteCropActions({
    toolMode,
    cropArea,
    cropBaseSize,
    lockCropAspect,
    setCropArea,
    setCanvasExpandMode,
    setCanvasSize,
    pushHistory,
  });
  const { isResampling, handleResampleAllResolution } = useSpriteResampleActions({
    canvasSize,
    imageRef,
    imageSize,
    imageSrc,
    setCanvasSize,
    setCropArea,
    setCanvasExpandMode,
    pushHistory,
    noFramesToSaveLabel: t.noFramesToSave,
  });

  const { handleExport } = useSpriteExportActions({
    hasRenderableFrames,
    tracks,
    projectName,
    fps,
    exportMp4,
    startProgress,
    endProgress,
    closeExportModal: () => setIsExportModalOpen(false),
    exportFailedLabel: t.exportFailed,
  });

  useSpriteKeyboardShortcuts({
    setIsSpacePressed,
    setSpriteToolMode,
    canUndo,
    canRedo,
    undo,
    redo,
    copyFrame,
    pasteFrame,
    saveProject,
    saveProjectAs,
    toolMode,
    applyCrop: handleApplyCrop,
    clearCrop: handleClearCrop,
  });

  useEffect(() => {
    if (toolMode === "pen") {
      setSpriteToolMode("select");
    }
  }, [toolMode, setSpriteToolMode]);

  return (
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden relative">
      {/* Loading overlay during autosave restore */}
      <LoadingOverlay
        isLoading={isAutosaveLoading || isProjectLoading}
        message={
          isProjectLoading
            ? `${t.loading || "Loading..."} ${loadProgress ? `${loadProgress.current}/${Math.max(1, loadProgress.total)} - ${loadProgress.itemName}` : ""}`
            : (t.loading || "Loading...")
        }
      />

      {/* Save toast notification */}
      <SaveToast
        isSaving={isSaving}
        saveCount={saveCount}
        savingLabel={
          saveProgress
            ? `${t.saving || "Saving…"} ${saveProgress.current}/${Math.max(1, saveProgress.total)} - ${saveProgress.itemName}`
            : (t.saving || "Saving…")
        }
        savedLabel={t.saved || "Saved"}
        progress={saveProgress ? {
          current: saveProgress.current,
          total: Math.max(1, saveProgress.total),
          detail: saveProgress.itemName,
        } : null}
      />

      {/* Hidden file input for menu-triggered image import */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Header Slot */}
      <HeaderContent
        title={t.spriteEditor}
        menuBar={
          <SpriteMenuBar
            onNew={handleNewProject}
            onLoad={() => setIsProjectListOpen(true)}
            onSave={saveProject}
            onSaveAs={saveProjectAs}
            onExport={() => setIsExportModalOpen(true)}
            onResampleAllResolution={() => void handleResampleAllResolution()}
            onImportImage={() => imageInputRef.current?.click()}
            onImportSheet={() => setIsSpriteSheetImportOpen(true)}
            onImportVideo={() => setIsVideoImportOpen(true)}
            onTogglePreview={() => setIsPreviewOpen(!isPreviewOpen)}
            onResetLayout={resetLayout}
            isPreviewOpen={isPreviewOpen}
            panelHeadersVisible={panelHeadersVisible}
            onTogglePanelHeaders={togglePanelHeaders}
            canSave={hasRenderableFrames && !isSaving && !isResampling}
            canExport={hasRenderableFrames && !isResampling}
            canResample={hasRenderableFrames && !isResampling}
            isLoading={isSaving || isResampling}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            translations={{
              file: t.file,
              edit: t.edit,
              view: t.view,
              window: t.window,
              new: t.new,
              load: t.load,
              save: t.save,
              saveAs: t.saveAs,
              export: t.export,
              resampleAllResolution: t.resampleAllResolution,
              importImage: t.importImage,
              importSheet: t.importSheet,
              importVideo: t.importVideo,
              undo: t.undo,
              redo: t.redo,
              preview: t.animation,
              resetLayout: t.resetLayout,
              panelHeaders: t.panelHeaders,
            }}
          />
        }
        projectName={{
          value: projectName,
          onChange: setProjectName,
          placeholder: t.projectName,
        }}
      />

      <SpriteTopToolbar
        toolMode={toolMode}
        magicWandSelectionMode={magicWandSelectionMode}
        setSpriteToolMode={setSpriteToolMode}
        isRemovingBackground={isRemovingBackground}
        isInterpolating={isInterpolating}
        hasFramesWithImage={frames.some((f) => Boolean(f.imageData))}
        hasInterpolatableSelection={interpolationPairCount > 0}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onRequestAISelection={() => {
          setSpriteToolMode("magicwand");
          setMagicWandSelectionMode("ai");
        }}
        onRequestBackgroundRemoval={() => setShowBgRemovalConfirm(true)}
        onRequestFrameInterpolation={() => setShowFrameInterpolationConfirm(true)}
        zoom={animPreviewZoom || 1}
        setZoom={(z) => {
          if (!animPreviewVpApi) return;
          const next = typeof z === "function" ? z(animPreviewVpApi.getZoom()) : z;
          animPreviewVpApi.setZoom(next);
        }}
        onFitToScreen={() => {
          if (!animPreviewVpApi) return;
          animPreviewVpApi.fitToContainer();
        }}
      />

      <SpriteToolOptionsBar
        toolMode={toolMode}
        brushColor={brushColor}
        setBrushColor={setBrushColor}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        brushHardness={brushHardness}
        setBrushHardness={setBrushHardness}
        magicWandTolerance={magicWandTolerance}
        setMagicWandTolerance={setMagicWandTolerance}
        magicWandFeather={magicWandFeather}
        setMagicWandFeather={setMagicWandFeather}
        activePreset={activePreset}
        setActivePreset={setActivePreset}
        presets={presets}
        pressureEnabled={pressureEnabled}
        setPressureEnabled={setPressureEnabled}
        onFillFrames={handleFillFrames}
        cropAspectRatio={cropAspectRatio}
        setCropAspectRatio={setCropAspectRatio}
        cropArea={cropArea}
        lockCropAspect={lockCropAspect}
        setLockCropAspect={setLockCropAspect}
        canvasExpandMode={canvasExpandMode}
        setCanvasExpandMode={setCanvasExpandMode}
        onSelectAllCrop={handleSelectAllCrop}
        onClearCrop={handleClearCrop}
        onCropWidthChange={handleCropWidthChange}
        onCropHeightChange={handleCropHeightChange}
        onExpandToSquare={handleExpandToSquare}
        onFitToSquare={handleFitToSquare}
        onApplyCrop={handleApplyCrop}
        selectedFrameId={selectedFrameId}
        selectedPointIndex={selectedPointIndex}
        frames={frames}
        labels={{
          size: t.size,
          hardness: t.hardness,
          tolerance: t.tolerance,
          feather: t.feather,
          colorPickerTip: t.colorPickerTip,
          brush: t.brush,
          eraser: t.eraser,
          magicWand: t.magicWand,
          eyedropper: t.eyedropper,
          zoomInOut: t.zoomInOut,
          frame: t.frame,
          selected: t.selected,
          point: t.point,
          presets: t.presets,
          pressure: t.pressure,
          builtIn: t.builtIn,
          fill: t.fill,
          fillToolTip: t.fillToolTip,
          zoomToolTip: t.zoomToolTip,
          cropToolTip: t.cropToolTip,
          magicWandToolTip: t.magicWandToolTip,
        }}
      />

      {/* Main Content - Split View */}
      <div className="flex-1 min-h-0 relative">
        <SplitView />
      </div>

      {/* Project List Modal */}
      <SpriteProjectListModal
        isOpen={isProjectListOpen}
        onClose={() => setIsProjectListOpen(false)}
        projects={savedProjects}
        currentProjectId={currentProjectId}
        onLoadProject={loadProject}
        onDeleteProject={deleteProject}
        storageInfo={storageInfo}
        isLoading={isProjectLoading}
        loadProgress={loadProgress}
        translations={{
          savedProjects: t.savedProjects || "저장된 프로젝트",
          noSavedProjects: t.noSavedProjects || "저장된 프로젝트가 없습니다",
          storage: t.storage || "저장소",
          load: t.load || "불러오기",
          delete: t.delete,
          frames: t.frames || "프레임",
          loading: t.loading,
        }}
      />

      <SyncDialog
        isOpen={showSyncDialog}
        localCount={localProjectCount}
        cloudCount={cloudProjectCount}
        onKeepCloud={handleKeepCloud}
        onKeepLocal={handleKeepLocal}
        onCancel={handleCancelSync}
      />

      {/* Export Modal */}
      <SpriteExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExport}
        defaultFileName={projectName.trim() || "sprite-project"}
        currentFps={fps}
        defaultFrameSize={canvasSize}
        sourceFrameSize={detectedSourceFrameSize}
        isExporting={isExporting}
        exportProgress={exportProgress}
        translations={{
          export: t.export,
          cancel: t.cancel,
          exportType: t.exportType,
          exportTypeZip: t.exportTypeZip,
          exportTypeSpriteSheetPng: t.exportTypeSpriteSheetPng,
          exportTypeSpriteSheetWebp: t.exportTypeSpriteSheetWebp,
          exportTypeMp4: t.exportTypeMp4,
          exportFileName: t.exportFileName,
          exportCanvasSize: t.exportCanvasSize,
          exportUseSourceSize: t.exportUseSourceSize,
          exportWidth: t.exportWidth,
          exportHeight: t.exportHeight,
          exportKeepAspectRatio: t.exportKeepAspectRatio,
          exportCanvasSizeLimit: t.exportCanvasSizeLimit,
          exportPadding: t.exportPadding,
          backgroundColor: t.backgroundColor,
          exportBgTransparent: t.exportBgTransparent,
          quality: t.quality,
          compression: t.compression,
          compressionHighQuality: t.compressionHighQuality,
          compressionBalanced: t.compressionBalanced,
          compressionSmallFile: t.compressionSmallFile,
          exportLoopCount: t.exportLoopCount,
          exporting: t.exporting,
          exportTypeOptimizedZip: t.exportTypeOptimizedZip,
          exportOptimizedTarget: t.exportOptimizedTarget,
          exportOptimizedThreshold: t.exportOptimizedThreshold,
          exportOptimizedThresholdHint: t.exportOptimizedThresholdHint,
          exportOptimizedIncludeGuide: t.exportOptimizedIncludeGuide,
          exportOptimizedImageFormat: t.exportOptimizedImageFormat,
          exportOptimizedFormatPng: t.exportOptimizedFormatPng,
          exportOptimizedFormatWebp: t.exportOptimizedFormatWebp,
          exportOptimizedTileSize: t.exportOptimizedTileSize,
        }}
      />

      {/* Sprite Sheet Import Modal */}
      <SpriteSheetImportModal
        isOpen={isSpriteSheetImportOpen}
        onClose={() => setIsSpriteSheetImportOpen(false)}
        onImport={handleSpriteSheetImport}
        startFrameId={nextFrameId}
      />

      {/* Video Import Modal */}
      <VideoImportModal
        isOpen={isVideoImportOpen}
        onClose={() => {
          setIsVideoImportOpen(false);
          setPendingVideoFile(null);
        }}
        onImport={handleVideoImport}
        startFrameId={nextFrameId}
        initialFile={pendingVideoFile}
        translations={{
          videoImport: t.videoImport,
          selectVideo: t.selectVideo,
          videoPreview: t.videoPreview,
          extractionSettings: t.extractionSettings,
          extractFrames: t.extractFrames,
          everyNthFrame: t.everyNthFrame,
          timeInterval: t.timeInterval,
          seconds: t.seconds,
          extracting: t.extracting,
          maxFrames: t.maxFrames,
          extractedFrames: t.extractedFrames,
          noFramesExtracted: t.noFramesExtracted,
          selectAll: t.selectAll,
          deselectAll: t.deselectAll,
          framesSelected: t.framesSelected,
          importSelected: t.importSelected,
          cancel: t.cancel,
        }}
      />

      {/* Background Removal Modals */}
      <FrameBackgroundRemovalModals
        showConfirm={showBgRemovalConfirm}
        onCloseConfirm={() => setShowBgRemovalConfirm(false)}
        onConfirmCurrentFrame={() => {
          setShowBgRemovalConfirm(false);
          handleRemoveBackground("current");
        }}
        onConfirmSelectedFrames={() => {
          setShowBgRemovalConfirm(false);
          handleRemoveBackground("selected");
        }}
        onConfirmAllFrames={() => {
          setShowBgRemovalConfirm(false);
          handleRemoveBackground("all");
        }}
        quality={bgRemovalQuality}
        onQualityChange={setBgRemovalQuality}
        isRemoving={isRemovingBackground}
        progress={bgRemovalProgress}
        status={bgRemovalStatus}
        hasFrames={frames.filter((f) => f.imageData).length > 0}
        selectedFrameCount={selectedFrameIds.length}
        translations={{
          removeBackground: t.removeBackground,
          cancel: t.cancel,
          removingBackgroundDesc: t.removingBackgroundDesc,
          frameBackgroundRemoval: t.frameBackgroundRemoval,
          firstRunDownload: t.firstRunDownload,
          currentFrame: t.removeBackgroundCurrentFrame,
          selectedFrames: t.removeBackgroundSelectedFrames,
          allFrames: t.removeBackgroundAllFrames,
        }}
      />

      <FrameInterpolationModals
        showConfirm={showFrameInterpolationConfirm}
        onCloseConfirm={() => setShowFrameInterpolationConfirm(false)}
        onConfirm={async () => {
          setShowFrameInterpolationConfirm(false);
          await handleInterpolateFrames({
            steps: interpolationSteps,
            quality: interpolationQuality,
          });
        }}
        isInterpolating={isInterpolating}
        progress={interpolationProgress}
        status={interpolationStatus}
        selectedFrameCount={selectedFrameIds.length}
        interpolationPairCount={interpolationPairCount}
        steps={interpolationSteps}
        quality={interpolationQuality}
        onStepsChange={setInterpolationSteps}
        onQualityChange={setInterpolationQuality}
        translations={{
          frameInterpolation: t.frameInterpolation,
          interpolationDescription: t.frameInterpolationDescription,
          interpolationSteps: t.interpolationSteps,
          interpolationQuality: t.interpolationQuality,
          qualityFast: t.interpolationQualityFast,
          qualityHigh: t.interpolationQualityHigh,
          qualityFastHint: t.interpolationQualityFastHint,
          qualityHighHint: t.interpolationQualityHighHint,
          estimatedFrames: t.interpolationEstimatedFrames,
          firstRunDownload: t.interpolationFirstRunDownload,
          cancel: t.cancel,
          generate: t.confirm,
        }}
      />

      <PanLockFloatingButton
        isPanLocked={isPanLocked}
        onTogglePanLock={() => setIsPanLocked(!isPanLocked)}
        storageKey="artkit.sprite.pan-toggle-position-v1"
      />
    </div>
  );
}

// ============================================
// Main Page Component with Providers
// ============================================

export default function SpriteEditor() {
  return (
    <EditorProvider>
      <LayoutProvider>
        <SpriteEditorMain />
      </LayoutProvider>
    </EditorProvider>
  );
}
