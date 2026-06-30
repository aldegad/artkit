"use client";

import {
  HeaderContent,
  SaveToast,
  LoadingOverlay,
  Select,
  Scrollbar,
  CanvasCropControls,
  PanLockFloatingButton,
  SaveProjectModal,
} from "@/shared/components";
import {
  BrushIcon,
  ImageIcon,
  PlusIcon,
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
  useVideoLayout,
  VideoMenuBar,
  VideoToolbar,
  VideoCanvasSizeEditor,
  VideoCanvasOverlayModal,
  VideoExportModal,
  VideoInterpolationModal,
  MaskControls,
  VideoSplitContainer,
  VideoFloatingWindows,
  VideoProjectListModal,
} from "@/domains/video";
import { ASPECT_RATIOS, type AspectRatio } from "@/shared/types/aspectRatio";
import { useVideoEditorController } from "./_hooks/useVideoEditorController";

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
  const {
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
  } = useVideoEditorController();

  return (
    <div
      ref={editorRootRef}
      data-video-editor-root=""
      className="h-full bg-background text-text-primary flex flex-col overflow-hidden overscroll-x-none relative"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Loading overlay during autosave restore */}
      <LoadingOverlay isLoading={!isAutosaveInitialized} message={t.loading || "Loading..."} />
      <LoadingOverlay isLoading={isInpaintingClip} message={inpaintStatusLabel || t.videoInpaintPreparing} />

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
            onInpaintClip={handleInpaintClip}
            canInpaintClip={canInpaintClip}
            isInpaintingClip={isInpaintingClip}
            onClearInpaintRegion={clearInpaintRegion}
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
            <div className="w-px h-4 bg-border-default mx-0.5" />
            <button
              onClick={handleCreateCanvasOverlay}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 hover:bg-interactive-hover transition-colors"
              title="빈 오버레이 캔버스 클립 추가"
            >
              <PlusIcon className="w-4 h-4" />
              <ImageIcon className="w-4 h-4" />
              <span className="text-xs">오버레이</span>
            </button>
            <button
              onClick={handleEditCanvasOverlay}
              disabled={!selectedCanvasOverlayClip}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 hover:bg-interactive-hover disabled:opacity-30 transition-colors"
              title="선택한 오버레이 캔버스 편집"
            >
              <BrushIcon className="w-4 h-4" />
              <span className="text-xs">편집</span>
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
        accept={supportedMediaAccept}
        multiple
        className="hidden"
        onChange={handleMediaFileInputChange}
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
        defaultFileName={defaultExportFileName}
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

      <VideoCanvasOverlayModal
        isOpen={Boolean(editingCanvasOverlayClip)}
        clip={editingCanvasOverlayClip}
        onClose={handleCloseCanvasOverlayModal}
        onSave={handleSaveCanvasOverlay}
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
