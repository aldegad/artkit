"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { useCanvasViewport } from "@/shared/hooks/useCanvasViewport";
import { useLanguage, useAuth } from "@/shared/contexts";
import { HeaderContent, SaveToast, LoadingOverlay } from "@/shared/components";
import { ExportModal } from "@/domains/image/components/ExportModal";
import {
  EditorToolMode,
  HistoryAdapter,
  EditorHistorySnapshot,
  ProjectListModal,
  useHistory,
  useLayerManagement,
  useBrushTool,
  useCanvasInput,
  useSelectionTool,
  useCropTool,
  useKeyboardShortcuts,
  useMouseHandlers,
  useCanvasRendering,
  useBackgroundRemoval,
  useTransformTool,
  useGuideTool,
  useEditorSave,
  useEditorSaveActions,
  useImageExport,
  useImageProjectIO,
  createEditorToolButtons,
  useEditorCanvasActions,
  useEditorCursor,
  useTransformShortcuts,
  useImageImport,
  useLayersPanelToggle,
  useEditorHistoryAdapter,
  useToolModeGuard,
  useEditorToolRuntime,
  useViewportBridge,
  useGuideDragPreview,
  useRotateMenu,
  useEditorPanelRegistration,
  useRulerRenderSync,
  useEditorLayerContextValue,
  useEditorCanvasContextValue,
  BackgroundRemovalModals,
  TransformDiscardConfirmModal,
  EditorActionToolbar,
  EditorToolOptions,
  EditorStatusBar,
  PanModeToggle,
  EditorMenuBar,
  EditorLayersProvider,
  EditorCanvasProvider,
} from "@/domains/image";
// IndexedDB storage functions are now used through storageProvider
import { getStorageProvider } from "@/domains/image/services/projectStorage";
import { SyncDialog } from "@/shared/components/app/auth";
import {
  EditorLayoutProvider,
  useEditorLayout,
  EditorStateProvider,
  EditorRefsProvider,
  useEditorState,
  useEditorRefs,
} from "@/domains/image/contexts";
import {
  EditorSplitContainer,
  EditorFloatingWindows,
} from "@/domains/image/components/layout";

// Inner component that accesses the layout context
function EditorDockableArea() {
  const { layoutState } = useEditorLayout();
  return (
    <>
      <EditorSplitContainer node={layoutState.root} />
      <EditorFloatingWindows />
    </>
  );
}

// Main export - wraps with all providers
export default function ImageEditor() {
  return (
    <EditorLayoutProvider>
      <EditorStateProvider>
        <EditorRefsProvider>
          <ImageEditorContent />
        </EditorRefsProvider>
      </EditorStateProvider>
    </EditorLayoutProvider>
  );
}

// Inner component that uses contexts
function ImageEditorContent() {
  const { t } = useLanguage();
  const { user } = useAuth();

  // Layout context (Provider is above in ImageEditor)
  const { isPanelOpen, openFloatingWindow, closeFloatingWindow, removePanel, layoutState } = useEditorLayout();
  const isLayersOpen = isPanelOpen("layers");

  const { handleToggleLayers } = useLayersPanelToggle({
    isLayersOpen,
    floatingWindows: layoutState.floatingWindows,
    root: layoutState.root,
    closeFloatingWindow,
    removePanel,
    openFloatingWindow,
  });

  // Storage provider based on auth state
  const storageProvider = useMemo(() => getStorageProvider(user), [user]);

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMode, setExportMode] = useState<"single" | "layers">("single");

  // Get state and setters from context
  const {
    state: {
      canvasSize,
      rotation,
      toolMode,
      zoom,
      pan,
      isSpacePressed,
      projectName,
      currentProjectId,
      savedProjects,
      isProjectListOpen,
      storageInfo,
      showBgRemovalConfirm,
      showRulers,
      showGuides,
      lockGuides,
      snapToGuides,
    },
    setCanvasSize,
    setRotation,
    setToolMode,
    setZoom,
    setPan,
    setIsSpacePressed,
    setProjectName,
    setCurrentProjectId,
    setSavedProjects,
    setIsProjectListOpen,
    setStorageInfo,
    setShowBgRemovalConfirm,
    setShowRulers,
    setShowGuides,
    setLockGuides,
    setSnapToGuides,
  } = useEditorState();

  // Get refs from context (shared canvas refs only)
  const {
    canvasRef,
    containerRef,
    imageRef,
    fileInputRef,
    editCanvasRef,
  } = useEditorRefs();

  const historyAdapterRef = useRef<HistoryAdapter<EditorHistorySnapshot> | null>(null);

  // Undo/Redo history - using extracted hook
  const { saveToHistory, undo, redo, clearHistory, canUndo, canRedo } = useHistory({
    editCanvasRef,
    historyAdapterRef,
    maxHistory: 50,
  });

  // Get display dimensions (considering rotation)
  const getDisplayDimensions = useCallback(() => {
    const width = rotation % 180 === 0 ? canvasSize.width : canvasSize.height;
    const height = rotation % 180 === 0 ? canvasSize.height : canvasSize.width;
    return { width, height };
  }, [rotation, canvasSize]);

  const displayDimensions = getDisplayDimensions();
  const viewport = useCanvasViewport({
    containerRef,
    canvasRef,
    contentSize: displayDimensions,
    config: {
      origin: "center",
      minZoom: 0.1,
      maxZoom: 10,
      wheelZoomFactor: 0.1,
    },
  });

  const { canvasRefCallback } = useViewportBridge({
    viewport,
    canvasRef,
    zoom,
    pan,
    setZoom,
    setPan,
  });

  // Crop tool - using extracted hook
  const {
    cropArea,
    setCropArea,
    aspectRatio,
    setAspectRatio,
    canvasExpandMode,
    setCanvasExpandMode,
    lockAspect,
    setLockAspect,
    selectAllCrop,
    clearCrop,
    getAspectRatioValue,
    setCropSize,
    expandToSquare,
    fitToSquare,
    getCropHandleAtPosition,
    moveCrop,
    resizeCrop,
    startCrop,
    updateCrop,
    updateCropExpand,
    validateCrop,
  } = useCropTool();

  // Layer management - using extracted hook
  const {
    layers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
    selectedLayerIds,
    setSelectedLayerIds,
    layerCanvasesRef,
    draggedLayerId,
    setDraggedLayerId,
    dragOverLayerId,
    setDragOverLayerId,
    addPaintLayer,
    addImageLayer,
    deleteLayer,
    selectLayer,
    toggleLayerVisibility,
    updateLayer,
    updateLayerOpacity,
    updateLayerPosition,
    updateMultipleLayerPositions,
    renameLayer,
    toggleLayerLock,
    moveLayer,
    reorderLayers,
    mergeLayerDown,
    duplicateLayer,
    rotateAllLayerCanvases,
    selectLayerWithModifier,
    clearLayerSelection,
    alignLayers,
    distributeLayers,
    initLayers,
    addLayer,
  } = useLayerManagement({
    getDisplayDimensions,
    saveToHistory,
    editCanvasRef,
    translations: {
      layer: t.layer,
      minOneLayerRequired: t.minOneLayerRequired,
    },
  });

  const { historyAdapter } = useEditorHistoryAdapter({
    layers,
    activeLayerId,
    selectedLayerIds,
    layerCanvasesRef,
    canvasSize,
    editCanvasRef,
    setLayers,
    setActiveLayerId,
    setSelectedLayerIds,
  });

  const layerContextValue = useEditorLayerContextValue({
    layers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
    selectedLayerIds,
    setSelectedLayerIds,
    draggedLayerId,
    setDraggedLayerId,
    dragOverLayerId,
    setDragOverLayerId,
    layerCanvasesRef,
    editCanvasRef,
    addPaintLayer,
    addImageLayer,
    deleteLayer,
    selectLayer,
    toggleLayerVisibility,
    updateLayer,
    updateLayerOpacity,
    updateLayerPosition,
    updateMultipleLayerPositions,
    renameLayer,
    toggleLayerLock,
    moveLayer,
    reorderLayers,
    mergeLayerDown,
    duplicateLayer,
    rotateAllLayerCanvases,
    selectLayerWithModifier,
    clearLayerSelection,
    alignLayers,
    distributeLayers,
    initLayers,
    addLayer,
  });

  // Brush tool - using extracted hook
  const {
    brushSize,
    setBrushSize,
    brushColor,
    setBrushColor,
    brushHardness,
    setBrushHardness,
    stampSource,
    setStampSource,
    // Preset state
    activePreset,
    setActivePreset,
    presets,
    deletePreset,
    pressureEnabled,
    setPressureEnabled,
    // Actions
    drawOnEditCanvas,
    pickColor,
    resetLastDrawPoint,
  } = useBrushTool();

  // Canvas input handling - normalized pointer events
  const { getMousePos, screenToImage } = useCanvasInput({
    canvasRef,
    zoom,
    pan,
    getDisplayDimensions,
  });

  // Marquee selection - using extracted hook
  const {
    selection,
    setSelection,
    isMovingSelection,
    setIsMovingSelection,
    isDuplicating,
    setIsDuplicating,
    isAltPressed,
    setIsAltPressed,
    floatingLayerRef,
    clipboardRef,
    dragStartOriginRef,
    startSelection,
    updateSelection: updateSelectionArea,
    clearSelection,
    commitFloatingLayer,
    createFloatingLayer,
    moveFloatingLayer,
    copyToClipboard,
    pasteFromClipboard,
    selectAll: selectAllSelection,
  } = useSelectionTool({
    getDisplayDimensions,
    saveToHistory,
  });

  // Guide tool - using extracted hook (before transform tool for snap integration)
  const {
    guides,
    setGuides,
    addGuide,
    moveGuide,
    removeGuide,
    clearAllGuides,
    getGuideAtPosition,
  } = useGuideTool({
    getDisplayDimensions,
  });

  // Transform tool - using extracted hook
  const {
    transformState,
    aspectRatio: transformAspectRatio,
    setAspectRatio: setTransformAspectRatio,
    activeSnapSources: transformSnapSources,
    startTransform,
    cancelTransform,
    applyTransform,
    handleTransformMouseDown,
    handleTransformMouseMove,
    handleTransformMouseUp,
    isTransformActive,
  } = useTransformTool({
    layerCanvasesRef,
    editCanvasRef,
    layers,
    activeLayerId,
    saveToHistory,
    selection,
    // Snap options
    guides,
    canvasSize,
    snapEnabled: snapToGuides,
    // Multi-layer support
    selectedLayerIds,
  });

  const {
    showTransformDiscardConfirm,
    handleToolModeChange,
    handleTransformDiscardConfirm,
    handleTransformApplyAndSwitch,
    handleTransformDiscardCancel,
    previousToolModeRef,
  } = useToolModeGuard({
    toolMode,
    setToolMode,
    isTransformActive: transformState.isActive,
    cancelTransform,
    applyTransform,
  });

  const { fillWithColor, getActiveToolMode, activeLayerPosition } = useEditorToolRuntime({
    isSpacePressed,
    toolMode,
    layers,
    activeLayerId,
    editCanvasRef,
    brushColor,
    selection,
    saveToHistory,
  });

  // Mouse handlers - using extracted hook (gets zoom, pan, rotation, canvasSize, refs from context)
  const {
    isDragging,
    mousePos,
    hoveredGuide,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
  } = useMouseHandlers({
    layers,
    activeLayerPosition,
    getActiveToolMode,
    getDisplayDimensions,
    getMousePos,
    screenToImage,
    drawOnEditCanvas,
    pickColor,
    resetLastDrawPoint,
    stampSource,
    setStampSource,
    selection,
    setSelection,
    isMovingSelection,
    setIsMovingSelection,
    isDuplicating,
    setIsDuplicating,
    floatingLayerRef,
    dragStartOriginRef,
    cropArea,
    setCropArea,
    aspectRatio,
    getAspectRatioValue,
    canvasExpandMode,
    updateCropExpand,
    saveToHistory,
    fillWithColor,
    isTransformActive,
    handleTransformMouseDown,
    handleTransformMouseMove,
    handleTransformMouseUp,
    // Guide functions
    guides,
    showGuides,
    lockGuides,
    moveGuide,
    removeGuide,
    getGuideAtPosition,
    // Layer movement
    activeLayerId,
    updateLayerPosition,
    updateMultipleLayerPositions,
    // Multi-layer support
    selectedLayerIds,
  });

  const { guideDragPreview, handleGuideDragStateChange } = useGuideDragPreview();

  // Canvas rendering - using extracted hook (gets zoom, pan, rotation, canvasSize, toolMode, refs from context)
  const { requestRender } = useCanvasRendering({
    layerCanvasesRef,
    floatingLayerRef,
    layers,
    cropArea,
    canvasExpandMode,
    mousePos,
    brushSize,
    brushColor,
    stampSource,
    selection,
    isDuplicating,
    isMovingSelection,
    transformBounds: transformState.bounds,
    isTransformActive: transformState.isActive,
    transformLayerId: transformState.layerId,
    transformOriginalImageData: transformState.originalImageData,
    isSelectionBasedTransform: transformState.isSelectionBased,
    guides,
    showGuides,
    lockGuides,
    activeSnapSources: transformSnapSources,
    guideDragPreview,
    getDisplayDimensions,
  });

  const handleUndo = useCallback(() => {
    undo();
    requestRender();
  }, [undo, requestRender]);

  const handleRedo = useCallback(() => {
    redo();
    requestRender();
  }, [redo, requestRender]);

  historyAdapterRef.current = historyAdapter;

  // Keyboard shortcuts - using extracted hook (gets state, setters, and refs from context)
  useKeyboardShortcuts({
    setIsAltPressed,
    setBrushSize,
    undo: handleUndo,
    redo: handleRedo,
    selection,
    setSelection,
    clipboardRef,
    floatingLayerRef,
    isTransformActive: transformState.isActive,
    cancelTransform,
    getDisplayDimensions,
    saveToHistory,
    onToolModeChange: handleToolModeChange,
  });

  useRulerRenderSync({
    showRulers,
    requestRender,
  });

  // Background removal - using extracted hook
  const {
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    handleRemoveBackground,
  } = useBackgroundRemoval({
    layers,
    activeLayerId,
    selection,
    layerCanvasesRef,
    saveToHistory,
    translations: {
      backgroundRemovalFailed: t.backgroundRemovalFailed,
    },
  });

  useTransformShortcuts({
    toolMode,
    setToolMode,
    activeLayerId,
    layersCount: layers.length,
    isTransformActive: transformState.isActive,
    startTransform,
    applyTransform,
    cancelTransform,
    previousToolModeRef,
  });

  const {
    loadImageFile,
    handleFileSelect,
    handleDrop,
    handleDragOver,
  } = useImageImport({
    layersCount: layers.length,
    addImageLayer,
    layerCanvasesRef,
    editCanvasRef,
    imageRef,
    setLayers,
    setActiveLayerId,
    setCanvasSize,
    setRotation,
    setCropArea,
    setZoom,
    setPan,
    setStampSource,
  });

  useEditorPanelRegistration();

  const {
    rotate,
    fitToScreen,
    handleApplyCrop,
  } = useEditorCanvasActions({
    layers,
    activeLayerId,
    layerCanvasesRef,
    editCanvasRef,
    containerRef,
    cropArea,
    rotation,
    canvasSize,
    getDisplayDimensions,
    rotateAllLayerCanvases,
    saveToHistory,
    setLayers,
    setCanvasSize,
    setRotation,
    setCropArea,
    setCanvasExpandMode,
    setZoom,
    setPan,
  });

  const {
    showRotateMenu,
    toggleRotateMenu,
    handleRotateLeft,
    handleRotateRight,
  } = useRotateMenu({ rotate });

  // Background removal handler - moved to useBackgroundRemoval hook
  // selectAllCrop and clearCrop - moved to useCropTool hook

  const { handleExportFromModal } = useImageExport({
    layers,
    layerCanvasesRef,
    cropArea,
    selectedLayerIds,
    activeLayerId,
    getDisplayDimensions,
  });

  const { getCursor } = useEditorCursor({
    hoveredGuide,
    showGuides,
    lockGuides,
    getActiveToolMode,
    isDragging,
    isMovingSelection,
    isDuplicating,
    selection,
    isAltPressed,
    mousePos,
  });

  const displaySize = getDisplayDimensions();

  const canvasContextValue = useEditorCanvasContextValue({
    containerRef,
    canvasRefCallback,
    layers,
    handleDrop,
    handleDragOver,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    getCursor,
    loadImageFile,
    displaySize,
    onGuideCreate: addGuide,
    onGuideDragStateChange: handleGuideDragStateChange,
  });

  const {
    isLoading,
    isAutosaveLoading,
    isInitialized,
    showSyncDialog,
    localProjectCount,
    cloudProjectCount,
    handleLoadProject,
    handleDeleteProject,
    handleNewCanvas,
    handleKeepCloud,
    handleKeepLocal,
    handleCancelSync,
  } = useImageProjectIO({
    user,
    storageProvider,
    layers,
    currentProjectId,
    setProjectName,
    setCurrentProjectId,
    setRotation,
    setCanvasSize,
    setCropArea,
    setSelection,
    setZoom,
    setPan,
    setStampSource,
    setLayers,
    setActiveLayerId,
    setSavedProjects,
    setStorageInfo,
    setIsProjectListOpen,
    setGuides,
    setBrushSize,
    setBrushColor,
    setBrushHardness,
    setShowRulers,
    setShowGuides,
    setLockGuides,
    setSnapToGuides,
    initLayers,
    layerCanvasesRef,
    editCanvasRef,
    imageRef,
    clearHistory,
    translations: {
      deleteConfirm: t.deleteConfirm,
      deleteFailed: t.deleteFailed,
      unsavedChangesConfirm: t.unsavedChangesConfirm,
    },
  });

  // Save hook - handles autosave and manual save
  const {
    saveProject: handleSaveProject,
    saveAsProject: handleSaveAsProject,
    isSaving,
  } = useEditorSave({
    storageProvider,
    layers,
    layerCanvasesRef,
    canvasSize,
    rotation,
    zoom,
    pan,
    projectName,
    currentProjectId,
    activeLayerId,
    guides,
    brushSize,
    brushColor,
    brushHardness,
    showRulers,
    showGuides,
    lockGuides,
    snapToGuides,
    setCurrentProjectId,
    setSavedProjects,
    setStorageInfo,
    isInitialized,
  });

  const {
    saveCount,
    handleSaveProjectAction,
    handleSaveAsProjectAction,
  } = useEditorSaveActions({
    saveProject: handleSaveProject,
    saveAsProject: handleSaveAsProject,
    canSave: layers.length > 0,
    saveFailedMessage: t.saveFailed,
  });

  const toolButtons = useMemo(() => createEditorToolButtons(t), [t]);

  return (
    <EditorLayersProvider value={layerContextValue}>
    <EditorCanvasProvider value={canvasContextValue}>
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden relative">
      {/* Loading overlay during autosave restore */}
      <LoadingOverlay isLoading={isAutosaveLoading} message={t.loading || "Loading..."} />

      {/* Save toast notification */}
      <SaveToast
        isSaving={isSaving}
        saveCount={saveCount}
        savingLabel={t.saving || "Saving…"}
        savedLabel={t.saved || "Saved"}
      />

      {/* Header Slot Content */}
      <HeaderContent
        title={t.imageEditor}
        menuBar={
          <EditorMenuBar
            onNew={handleNewCanvas}
            onLoad={() => setIsProjectListOpen(true)}
            onSave={handleSaveProjectAction}
            onSaveAs={handleSaveAsProjectAction}
            onImportImage={() => fileInputRef.current?.click()}
            onExport={() => { setExportMode("single"); setShowExportModal(true); }}
            onExportLayers={() => { setExportMode("layers"); setShowExportModal(true); }}
            onToggleLayers={handleToggleLayers}
            isLayersOpen={isLayersOpen}
            canSave={layers.length > 0}
            hasSelectedLayers={selectedLayerIds.length > 0 || activeLayerId !== null}
            isLoading={isLoading || isSaving}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo()}
            canRedo={canRedo()}
            showRulers={showRulers}
            showGuides={showGuides}
            lockGuides={lockGuides}
            snapToGuides={snapToGuides}
            onToggleRulers={() => setShowRulers(!showRulers)}
            onToggleGuides={() => setShowGuides(!showGuides)}
            onToggleLockGuides={() => setLockGuides(!lockGuides)}
            onToggleSnapToGuides={() => setSnapToGuides(!snapToGuides)}
            onClearGuides={clearAllGuides}
            translations={{
              file: t.file,
              edit: t.edit,
              view: t.view,
              window: t.window,
              new: t.new,
              load: t.load,
              save: t.save,
              saveAs: t.saveAs,
              importImage: t.importImage,
              export: t.export,
              exportLayers: t.exportLayers,
              undo: t.undo,
              redo: t.redo,
              layers: t.layers,
              showRulers: t.showRulers,
              showGuides: t.showGuides,
              lockGuides: t.lockGuides,
              snapToGuides: t.snapToGuides,
              clearGuides: t.clearGuides,
            }}
          />
        }
        projectName={layers.length > 0 ? {
          value: projectName,
          onChange: setProjectName,
          placeholder: t.projectName,
        } : undefined}
        extra={layers.length > 0 ? <div className="flex-1" /> : undefined}
      />

      {/* Row 2: Tools (only when layers exist) */}
      {layers.length > 0 && (
        <EditorActionToolbar
          toolButtons={toolButtons}
          toolMode={toolMode}
          onToolModeChange={handleToolModeChange}
          onOpenBackgroundRemoval={() => setShowBgRemovalConfirm(true)}
          isRemovingBackground={isRemovingBackground}
          onUndo={handleUndo}
          onRedo={handleRedo}
          showRotateMenu={showRotateMenu}
          onToggleRotateMenu={toggleRotateMenu}
          onRotateLeft={handleRotateLeft}
          onRotateRight={handleRotateRight}
          zoom={zoom}
          setZoom={setZoom}
          onFitToScreen={fitToScreen}
          translations={{
            removeBackground: t.removeBackground,
            undo: t.undo,
            redo: t.redo,
            rotate: t.rotate,
            rotateLeft: t.rotateLeft,
            rotateRight: t.rotateRight,
            fitToScreen: t.fitToScreen,
          }}
        />
      )}

      {/* Top Toolbar - Row 3: Tool-specific controls */}
      {layers.length > 0 && (
        <EditorToolOptions
          toolMode={toolMode}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          brushHardness={brushHardness}
          setBrushHardness={setBrushHardness}
          brushColor={brushColor}
          setBrushColor={setBrushColor}
          stampSource={stampSource}
          activePreset={activePreset}
          presets={presets}
          onSelectPreset={setActivePreset}
          onDeletePreset={deletePreset}
          pressureEnabled={pressureEnabled}
          onPressureToggle={setPressureEnabled}
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          cropArea={cropArea}
          selectAll={selectAllCrop}
          clearCrop={clearCrop}
          canvasExpandMode={canvasExpandMode}
          setCanvasExpandMode={setCanvasExpandMode}
          lockAspect={lockAspect}
          setLockAspect={setLockAspect}
          setCropSize={setCropSize}
          expandToSquare={expandToSquare}
          fitToSquare={fitToSquare}
          onApplyCrop={handleApplyCrop}
          currentToolName={toolButtons.find(tb => tb.mode === toolMode)?.name}
          isTransformActive={transformState.isActive}
          transformAspectRatio={transformAspectRatio}
          setTransformAspectRatio={setTransformAspectRatio}
          onApplyTransform={applyTransform}
          onCancelTransform={() => {
            cancelTransform();
            setToolMode("move");
          }}
          translations={{
            size: t.size,
            hardness: t.hardness,
            color: t.color,
            source: t.source,
            altClickToSetSource: t.altClickToSetSource,
            presets: "Presets",
            pressure: "Pressure",
            builtIn: "Built-in",
          }}
        />
      )}

      {/* Main Content Area with Docking System */}
      <div className="flex-1 h-full w-full min-h-0 flex overflow-hidden relative">
        <EditorDockableArea />
        {/* Mobile Pan Mode Toggle - draggable floating button */}
        {layers.length > 0 && <PanModeToggle />}
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={(fileName, fmt, q, backgroundColor) =>
          handleExportFromModal(fileName, fmt, q, backgroundColor, exportMode)
        }
        defaultFileName={projectName || "Untitled"}
        mode={exportMode}
        translations={{
          export: t.export,
          cancel: t.cancel,
          fileName: t.projectName,
          format: t.format,
          quality: t.quality,
          backgroundColor: t.background,
          transparent: t.transparent,
        }}
      />

      {/* Background Removal Modals */}
      <BackgroundRemovalModals
        showConfirm={showBgRemovalConfirm}
        onCloseConfirm={() => setShowBgRemovalConfirm(false)}
        onConfirm={() => {
          setShowBgRemovalConfirm(false);
          handleRemoveBackground();
        }}
        hasSelection={!!selection}
        isRemoving={isRemovingBackground}
        progress={bgRemovalProgress}
        status={bgRemovalStatus}
        translations={{
          removeBackground: t.removeBackground,
          cancel: t.cancel,
          confirm: t.confirm,
        }}
      />

      {/* Transform Discard Confirmation Modal */}
      <TransformDiscardConfirmModal
        show={showTransformDiscardConfirm}
        onClose={handleTransformDiscardCancel}
        onDiscard={handleTransformDiscardConfirm}
        onApply={handleTransformApplyAndSwitch}
        translations={{
          title: "변환 취소",
          message: "적용하지 않은 변환이 있습니다. 변환을 취소하면 원래 상태로 되돌아갑니다.",
          discard: "취소하고 전환",
          apply: "적용하고 전환",
          cancel: "돌아가기",
        }}
      />

      {/* Bottom status bar */}
      {layers.length > 0 && (
        <EditorStatusBar
          canvasSize={canvasSize}
          rotation={rotation}
          zoom={zoom}
          cropArea={cropArea}
          selection={selection}
        />
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />


      {/* Project List Modal */}
      <ProjectListModal
        isOpen={isProjectListOpen}
        onClose={() => setIsProjectListOpen(false)}
        projects={savedProjects}
        currentProjectId={currentProjectId}
        onLoadProject={handleLoadProject}
        onDeleteProject={handleDeleteProject}
        storageInfo={storageInfo}
        isLoading={isLoading}
        translations={{
          savedProjects: t.savedProjects || "저장된 프로젝트",
          noSavedProjects: t.noSavedProjects || "저장된 프로젝트가 없습니다",
          delete: t.delete,
          loading: t.loading,
        }}
      />

      {/* Sync Dialog */}
      <SyncDialog
        isOpen={showSyncDialog}
        localCount={localProjectCount}
        cloudCount={cloudProjectCount}
        onKeepCloud={handleKeepCloud}
        onKeepLocal={handleKeepLocal}
        onCancel={handleCancelSync}
      />
    </div>
    </EditorCanvasProvider>
    </EditorLayersProvider>
  );
}
