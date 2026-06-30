"use client";

import { useCallback, useMemo, useRef } from "react";
import { useSaveProjectDialog } from "@/shared/hooks";
import { useLanguage, useAuth } from "@/shared/contexts";
import { getStorageProvider } from "../services/projectStorage";
import {
  useEditorLayout,
  useEditorRefs,
  useEditorState,
} from "../contexts";
import { useHistory, HistoryAdapter } from "./useHistory";
import { useLayerManagement } from "./useLayerManagement";
import { useBrushTool } from "./useBrushTool";
import { useCanvasInput } from "./useCanvasInput";
import { useSelectionTool } from "./tools/useSelectionTool";
import { useCropTool } from "./tools/useCropTool";
import { useWatermarkMaskTool } from "./tools/useWatermarkMaskTool";
import { useTextTool, TEXT_FONT_OPTIONS } from "./useTextTool";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useMouseHandlers } from "./useMouseHandlers";
import { useCanvasRendering } from "./useCanvasRendering";
import { useWatermarkRemoval } from "./useWatermarkRemoval";
import { useTransformTool } from "./useTransformTool";
import { useGuideTool } from "./useGuideTool";
import { useEditorSave } from "./useEditorSave";
import { useEditorSaveActions } from "./useEditorSaveActions";
import { useImageExport } from "./useImageExport";
import { useImageProjectIO } from "./useImageProjectIO";
import { useEditorCanvasActions } from "./useEditorCanvasActions";
import { useEditorCursor } from "./useEditorCursor";
import { useTransformShortcuts } from "./useTransformShortcuts";
import { useImageImport } from "./useImageImport";
import { useLayersPanelToggle } from "./useLayersPanelToggle";
import {
  useEditorHistoryAdapter,
  EditorHistorySnapshot,
} from "./useEditorHistoryAdapter";
import { useToolModeGuard } from "./useToolModeGuard";
import { useEditorToolRuntime } from "./useEditorToolRuntime";
import { useGuideDragPreview } from "./useGuideDragPreview";
import { useRotateMenu } from "./useRotateMenu";
import { useEditorPanelRegistration } from "./useEditorPanelRegistration";
import { useRulerRenderSync } from "./useRulerRenderSync";
import { useEditorLayerContextValue } from "./useEditorLayerContextValue";
import { useEditorCanvasContextValue } from "./useEditorCanvasContextValue";
import { useEditorTranslationBundles } from "./useEditorTranslationBundles";
import { useEditorHeaderModel } from "./useEditorHeaderModel";
import { useEditorOverlayModel } from "./useEditorOverlayModel";
import { useImageEditorUiActions } from "./useImageEditorUiActions";
import { useImageEditorToolbarProps } from "./useImageEditorToolbarProps";
import { useImageResampleActions } from "./useImageResampleActions";
import { useImageUpscaleActions } from "./useImageUpscaleActions";
import { useDisplayDimensions } from "./useDisplayDimensions";
import { useBackgroundRemovalControls } from "./useBackgroundRemovalControls";
import { useSelectionOps } from "./useSelectionOps";
import { useTextLayerEditing } from "./useTextLayerEditing";
import { useLayerTransform } from "./useLayerTransform";
import { useLayerTransformActions } from "./useLayerTransformActions";
import { useEditorHistory } from "./useEditorHistory";
import { useProjectSaveDetails } from "./useProjectSaveDetails";
import {
  useMagicWandSelectionAction,
} from "./useImageSelectionActions";

export function useImageEditorController() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const uiText = useEditorTranslationBundles(t);

  const {
    isPanelOpen,
    openFloatingWindow,
    closeFloatingWindow,
    removePanel,
    layoutState,
    panelHeadersVisible,
    togglePanelHeaders,
  } = useEditorLayout();
  const isLayersOpen = isPanelOpen("layers");

  const { handleToggleLayers } = useLayersPanelToggle({
    isLayersOpen,
    floatingWindows: layoutState.floatingWindows,
    root: layoutState.root,
    closeFloatingWindow,
    removePanel,
    openFloatingWindow,
  });

  const storageProvider = useMemo(() => getStorageProvider(user), [user]);

  const {
    state: {
      canvasSize,
      rotation,
      toolMode,
      zoom,
      pan,
      isSpacePressed,
      projectName,
      projectGroup,
      currentProjectId,
      savedProjects,
      isProjectListOpen,
      storageInfo,
      showBgRemovalConfirm,
      showRulers,
      showGuides,
      lockGuides,
      snapToGuides,
      isPanLocked,
    },
    setCanvasSize,
    setRotation,
    setToolMode,
    setZoom,
    setPan,
    setProjectName,
    setProjectGroup,
    setCurrentProjectId,
    setSavedProjects,
    setIsProjectListOpen,
    setStorageInfo,
    setShowBgRemovalConfirm,
    setShowRulers,
    setShowGuides,
    setLockGuides,
    setSnapToGuides,
    setIsPanLocked,
  } = useEditorState();

  const { canvasRef, containerRef, imageRef, fileInputRef, editCanvasRef } = useEditorRefs();
  const {
    dialogState: saveDialogState,
    requestSaveDetails,
    closeDialog: closeSaveDialog,
    submitDialog: submitSaveDialog,
  } = useSaveProjectDialog();
  const historyAdapterRef = useRef<HistoryAdapter<EditorHistorySnapshot> | null>(null);

  const { saveToHistory, undo, redo, clearHistory, canUndo, canRedo } = useHistory({
    editCanvasRef,
    historyAdapterRef,
    maxHistory: 50,
  });

  const { getDisplayDimensions, canvasRefCallback } = useDisplayDimensions({
    canvasSize,
    rotation,
    containerRef,
    canvasRef,
    zoom,
    pan,
    setZoom,
    setPan,
  });

  const {
    cropArea,
    setCropArea,
    aspectRatio,
    setAspectRatio,
    canvasExpandMode,
    setCanvasExpandMode,
    lockAspect,
    setLockAspect,
    cropSizePivot,
    setCropSizePivot,
    selectAllCrop,
    clearCrop,
    getAspectRatioValue,
    setCropSize,
    expandToSquare,
    fitToSquare,
    fitToObjectBounds,
    updateCropExpand,
  } = useCropTool();

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
    addFilterLayer,
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
    createClippingMask,
    releaseClippingMask,
    duplicateLayer,
    rotateAllLayerCanvases,
    resizeSelectedLayersToSmallest,
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

  const {
    brushSize,
    setBrushSize,
    brushColor,
    setBrushColor,
    brushHardness,
    setBrushHardness,
    brushOpacity,
    setBrushOpacity,
    stampSource,
    setStampSource,
    activePreset,
    setActivePreset,
    presets,
    deletePreset,
    pressureEnabled,
    setPressureEnabled,
    drawOnEditCanvas,
    pickColor,
    resetLastDrawPoint,
  } = useBrushTool();
  const watermarkMaskTool = useWatermarkMaskTool();

  const { getMousePos, screenToImage } = useCanvasInput({
    canvasRef,
    zoom,
    pan,
    getDisplayDimensions,
  });

  const {
    selection,
    setSelection,
    clearSelection,
    selectionFeather,
    selectionOffset,
    setSelectionOffset,
    marqueeSubTool,
    setMarqueeSubTool,
    selectionCombineMode,
    setSelectionCombineMode,
    lassoPath,
    setLassoPath,
    selectionMask,
    setSelectionMask,
    magicWandTolerance,
    setMagicWandTolerance,
    magicWandAllowAlpha,
    setMagicWandAllowAlpha,
    isMovingSelection,
    setIsMovingSelection,
    isDuplicating,
    setIsDuplicating,
    isAltPressed,
    setIsAltPressed,
    floatingLayerRef,
    clipboardRef,
    dragStartOriginRef,
    previousCombineRef,
  } = useSelectionTool({
    getDisplayDimensions,
    saveToHistory,
  });

  const { historyAdapter } = useEditorHistoryAdapter({
    layers,
    activeLayerId,
    selectedLayerIds,
    selection,
    selectionMask,
    layerCanvasesRef,
    canvasSize,
    editCanvasRef,
    setLayers,
    setCanvasSize,
    setActiveLayerId,
    setSelectedLayerIds,
    setSelection,
    setSelectionMask,
  });

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

  const {
    transformState,
    aspectRatio: transformAspectRatio,
    setAspectRatio: setTransformAspectRatio,
    activeSnapSources: transformSnapSources,
    setTransformSizeByWidth,
    setTransformSizeByHeight,
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
    zoom,
    saveToHistory,
    selection,
    selectionMask,
    guides,
    canvasSize,
    snapEnabled: snapToGuides,
    selectedLayerIds,
  });

  const {
    textDraft,
    textStyle,
    setTextStyle,
    startTextAt,
    startEditingTextLayer,
    setTextDraftPosition,
    setTextDraftText,
    setTextDraftSize,
    applyTextDraft,
    cancelTextDraft,
    clearTextLayerMetadata,
    hasTextDraft,
  } = useTextTool({
    layers,
    setLayers,
    setActiveLayerId,
    layerCanvasesRef,
    editCanvasRef,
    saveToHistory,
    toolMode,
  });

  const rasterizeActiveTextLayer = useCallback(() => {
    const activeLayer = layers.find((layer) => layer.id === activeLayerId);
    if (!activeLayerId || !activeLayer?.textData) return;
    clearTextLayerMetadata([activeLayerId]);
  }, [activeLayerId, clearTextLayerMetadata, layers]);

  const { fillWithColor, getActiveToolMode, activeLayerPosition } = useEditorToolRuntime({
    isSpacePressed,
    toolMode,
    layers,
    activeLayerId,
    editCanvasRef,
    brushColor,
    selection,
    selectionFeather,
    saveToHistory,
    rasterizeActiveTextLayer,
  });

  const { handleApplyTransform } = useLayerTransform({
    transformLayerId: transformState.layerId,
    transformLayerIds: transformState.layerIds,
    applyTransform,
    clearTextLayerMetadata,
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
    applyTransform: handleApplyTransform,
  });

  const applyMagicWandSelection = useMagicWandSelectionAction({
    activeLayerId,
    editCanvasRef,
    activeLayerPosition,
    magicWandTolerance,
    magicWandAllowAlpha,
    selection,
    selectionMask,
    floatingLayerRef,
    setSelection,
    setSelectionMask,
    setIsMovingSelection,
    setIsDuplicating,
  });

  const {
    isDragging,
    dragType,
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
    drawMask: watermarkMaskTool.drawMask,
    resetLastMaskPoint: watermarkMaskTool.resetLastMaskPoint,
    stampSource,
    setStampSource,
    marqueeSubTool,
    selectionCombineMode,
    previousCombineRef,
    lassoPath,
    setLassoPath,
    selectionMask,
    setSelectionMask,
    selection,
    selectionFeather,
    selectionOffset,
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
    rasterizeActiveTextLayer,
    applyMagicWandSelection,
    isTransformActive,
    handleTransformMouseDown,
    handleTransformMouseMove,
    handleTransformMouseUp,
    guides,
    showGuides,
    lockGuides,
    moveGuide,
    removeGuide,
    getGuideAtPosition,
    activeLayerId,
    updateLayerPosition,
    updateMultipleLayerPositions,
    selectedLayerIds,
  });

  const { guideDragPreview, handleGuideDragStateChange } = useGuideDragPreview();

  // Stable identity so useCanvasRendering's render callback only recreates
  // when the hidden layer actually changes.
  const hiddenLayerIds = useMemo(
    () => (textDraft?.layerId ? [textDraft.layerId] : []),
    [textDraft?.layerId]
  );

  const { requestRender } = useCanvasRendering({
    layerCanvasesRef,
    floatingLayerRef,
    layers,
    activeLayerId,
    hiddenLayerIds,
    cropArea,
    canvasExpandMode,
    mousePos,
    brushSize,
    watermarkBrushSize: watermarkMaskTool.wmBrushSize,
    brushHardness,
    brushColor,
    stampSource,
    activeLayerPosition,
    selection,
    selectionMask,
    marqueeSubTool,
    lassoPath,
    isDuplicating,
    isMovingSelection,
    isDragging,
    dragType,
    transformBounds: transformState.bounds,
    isTransformActive: transformState.isActive,
    transformLayerId: transformState.layerId,
    transformLayerIds: transformState.layerIds,
    transformOriginalBounds: transformState.originalBounds,
    transformOriginalImageData: transformState.originalImageData,
    transformPerLayerData: transformState.perLayerData,
    transformRotation: transformState.rotation,
    transformFlipX: transformState.flipX,
    isSelectionBasedTransform: transformState.isSelectionBased,
    guides,
    showGuides,
    lockGuides,
    activeSnapSources: transformSnapSources,
    guideDragPreview,
    watermarkMaskCanvas: watermarkMaskTool.maskCanvasRef.current,
    watermarkMaskVersion: watermarkMaskTool.maskVersion,
    getDisplayDimensions,
  });

  const {
    clearSelectionPixels,
    invertSelection,
    selectLayerPixelsToSelection,
  } = useSelectionOps({
    selection,
    selectionMask,
    selectionFeather,
    editCanvasRef,
    activeLayerPosition,
    floatingLayerRef,
    saveToHistory,
    requestRender,
    getDisplayDimensions,
    setSelection,
    setSelectionMask,
    setLassoPath,
    setIsMovingSelection,
    setIsDuplicating,
    layers,
    layerCanvasesRef,
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
    addFilterLayer,
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
    createClippingMask,
    releaseClippingMask,
    duplicateLayer,
    rotateAllLayerCanvases,
    resizeSelectedLayersToSmallest,
    selectLayerWithModifier,
    selectLayerPixelsToSelection,
    clearLayerSelection,
    alignLayers,
    distributeLayers,
    initLayers,
    addLayer,
  });

  const {
    handleUndo,
    handleRedo,
    canUndoNow,
    canRedoNow,
  } = useEditorHistory({
    undo,
    redo,
    canUndo,
    canRedo,
    requestRender,
  });

  const {
    canResizeSelectedLayersToSmallest,
    canObjectFit,
    handleResizeSelectedLayersToSmallest,
    handleObjectFitToActiveLayer,
  } = useLayerTransformActions({
    selectedLayerIds,
    resizeSelectedLayersToSmallest,
    requestRender,
    activeLayerId,
    layers,
    layerCanvasesRef,
    fitToObjectBounds,
  });

  const { loadImageFile, loadImageFiles, handleFileSelect, handleDrop, handleDragOver } = useImageImport({
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

  historyAdapterRef.current = historyAdapter;

  useKeyboardShortcuts({
    setIsAltPressed,
    setBrushSize,
    undo: handleUndo,
    redo: handleRedo,
    selection,
    selectionMask,
    selectionFeather,
    setSelection,
    setSelectionMask,
    clearSelectionPixels,
    clipboardRef,
    floatingLayerRef,
    activeLayerId,
    isTransformActive: transformState.isActive,
    cancelTransform,
    getDisplayDimensions,
    loadImageFile,
    addImageLayer,
    saveToHistory,
    activeLayerPosition,
    onToolModeChange: handleToolModeChange,
  });

  useRulerRenderSync({
    showRulers,
    requestRender,
  });

  const {
    bgRemovalQuality,
    handleBgRemovalQualityChange,
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    handleRemoveBackground,
  } = useBackgroundRemovalControls({
    layers,
    activeLayerId,
    selection,
    layerCanvasesRef,
    saveToHistory,
    translations: {
      backgroundRemovalFailed: t.backgroundRemovalFailed,
    },
  });

  const watermarkRemoval = useWatermarkRemoval({
    layers,
    activeLayerId,
    layerCanvasesRef,
    saveToHistory,
    setToolMode,
    maskCanvasRef: watermarkMaskTool.maskCanvasRef,
    initMask: watermarkMaskTool.initMask,
    clearMask: watermarkMaskTool.clearMask,
  });

  useTransformShortcuts({
    toolMode,
    setToolMode,
    activeLayerId,
    layersCount: layers.length,
    isTransformActive: transformState.isActive,
    startTransform,
    applyTransform: handleApplyTransform,
    cancelTransform,
    previousToolModeRef,
  });

  useEditorPanelRegistration();

  const { rotate, fitToScreen, handleApplyCrop } = useEditorCanvasActions({
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
    setRotateMenuOpen,
    handleRotateLeft,
    handleRotateRight,
  } = useRotateMenu({ rotate });

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
  const {
    handleTextCanvasPointerDown,
    handleCanvasDoubleClick,
    handleApplyTextDraft,
    handleCancelTextDraft,
    textOverlay,
  } = useTextLayerEditing({
    toolMode,
    layers,
    layerCanvasesRef,
    canvasRef,
    displaySize,
    zoom,
    pan,
    textDraft,
    textStyle,
    hasTextDraft,
    getMousePos,
    screenToImage,
    handleMouseDown,
    handleToolModeChange,
    startEditingTextLayer,
    startTextAt,
    applyTextDraft,
    cancelTextDraft,
    setTextDraftPosition,
    setTextDraftText,
    setTextDraftSize,
    requestRender,
  });

  const canvasContextValue = useEditorCanvasContextValue({
    containerRef,
    canvasRefCallback,
    layers,
    handleDrop,
    handleDragOver,
    handleMouseDown: handleTextCanvasPointerDown,
    handleDoubleClick: handleCanvasDoubleClick,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    getCursor,
    loadImageFile,
    loadImageFiles,
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
    showNewCanvasChoiceModal,
    setShowNewCanvasChoiceModal,
    showBlankCanvasSizeModal,
    setShowBlankCanvasSizeModal,
    handleStartWithImage,
    handleOpenBlankCanvasSize,
    createBlankCanvas,
  } = useImageProjectIO({
    user,
    storageProvider,
    layers,
    currentProjectId,
    setProjectName,
    setProjectGroup,
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
    setBrushOpacity,
    setShowRulers,
    setShowGuides,
    setLockGuides,
    setSnapToGuides,
    setIsPanLocked,
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

  const requestProjectSaveDetails = useProjectSaveDetails({
    requestSaveDetails,
    savedProjects,
  });

  const { saveProject: handleSaveProject, saveAsProject: handleSaveAsProject, isSaving } = useEditorSave({
    storageProvider,
    layers,
    layerCanvasesRef,
    canvasSize,
    rotation,
    zoom,
    pan,
    projectName,
    projectGroup,
    currentProjectId,
    activeLayerId,
    guides,
    brushSize,
    brushColor,
    brushHardness,
    brushOpacity,
    showRulers,
    showGuides,
    lockGuides,
    snapToGuides,
    isPanLocked,
    setProjectName,
    setProjectGroup,
    setCurrentProjectId,
    setSavedProjects,
    setStorageInfo,
    requestSaveDetails: requestProjectSaveDetails,
    isInitialized,
  });

  const { saveCount, handleSaveProjectAction, handleSaveAsProjectAction } = useEditorSaveActions({
    saveProject: handleSaveProject,
    saveAsProject: handleSaveAsProject,
    canSave: layers.length > 0,
    saveFailedMessage: t.saveFailed,
  });

  const hasLayers = layers.length > 0;
  const canResample = hasLayers && canvasSize.width > 0 && canvasSize.height > 0;

  const {
    isResampling,
    isResampleModalOpen,
    resampleWidth,
    resampleHeight,
    resampleKeepAspect,
    openResampleModal,
    closeResampleModal,
    setResampleWidth,
    setResampleHeight,
    toggleResampleKeepAspect,
    applyResample,
  } = useImageResampleActions({
    layers,
    activeLayerId,
    canvasSize,
    rotation,
    layerCanvasesRef,
    editCanvasRef,
    saveToHistory,
    setLayers,
    setCanvasSize,
    setCropArea,
    setCanvasExpandMode,
    setSelection,
  });

  const {
    isUpscaling,
    upscaleProgress,
    upscaleStatus,
    showUpscaleConfirm,
    upscaleScale,
    setUpscaleScale,
    openUpscaleConfirm,
    closeUpscaleConfirm,
    applyUpscale,
  } = useImageUpscaleActions({
    layers,
    activeLayerId,
    layerCanvasesRef,
    editCanvasRef,
    saveToHistory,
    setLayers,
  });

  const {
    showExportModal,
    setShowExportModal,
    exportMode,
    setExportMode,
    openProjectList,
    openExport,
    openImportImage,
    openBackgroundRemovalConfirm,
    togglePanLock,
  } = useImageEditorUiActions({
    fileInputRef,
    setIsProjectListOpen,
    setShowBgRemovalConfirm,
    isPanLocked,
    setIsPanLocked,
  });

  const headerProps = useEditorHeaderModel({
    title: t.imageEditor,
    layersCount: layers.length,
    projectName,
    onProjectNameChange: setProjectName,
    projectNamePlaceholder: t.projectName,
    onNew: handleNewCanvas,
    onLoad: openProjectList,
    onSave: handleSaveProjectAction,
    onSaveAs: handleSaveAsProjectAction,
    onImportImage: openImportImage,
    onExport: openExport,
    onResampleAllResolution: openResampleModal,
    onAIUpscale: openUpscaleConfirm,
    canAIUpscale: canResample && !isUpscaling,
    onToggleLayers: handleToggleLayers,
    isLayersOpen,
    canSave: hasLayers,
    canResample,
    isLoading: isLoading || isSaving || isResampling || isUpscaling,
    onUndo: handleUndo,
    onRedo: handleRedo,
    canUndo: canUndoNow,
    canRedo: canRedoNow,
    showRulers,
    showGuides,
    lockGuides,
    snapToGuides,
    setShowRulers,
    setShowGuides,
    setLockGuides,
    setSnapToGuides,
    onClearGuides: clearAllGuides,
    panelHeadersVisible,
    onTogglePanelHeaders: togglePanelHeaders,
    translations: uiText.menu,
  });

  const toolbarModels = useImageEditorToolbarProps({
    hasLayers,
    marqueeSubTool,
    toolButtonTranslations: t,
    actionToolbarConfig: {
      toolMode,
      onToolModeChange: handleToolModeChange,
      onActivateMagicWand: () => handleToolModeChange("magicWand"),
      onResizeSelectedLayersToSmallest: handleResizeSelectedLayersToSmallest,
      canResizeSelectedLayersToSmallest,
      onOpenBackgroundRemoval: openBackgroundRemovalConfirm,
      isRemovingBackground,
      onOpenWatermarkRemoval: watermarkRemoval.activateWatermarkTool,
      isProcessingWatermark: watermarkRemoval.isProcessing,
      onOpenUpscale: openUpscaleConfirm,
      isUpscaling,
      onUndo: handleUndo,
      onRedo: handleRedo,
      showRotateMenu,
      onRotateMenuOpenChange: setRotateMenuOpen,
      onRotateLeft: handleRotateLeft,
      onRotateRight: handleRotateRight,
      zoom,
      setZoom,
      onFitToScreen: fitToScreen,
    },
    actionToolbarTranslations: uiText.actionToolbar,
    toolOptionsConfig: {
      toolMode,
      brushSize,
      setBrushSize,
      watermarkBrushSize: watermarkMaskTool.wmBrushSize,
      setWatermarkBrushSize: watermarkMaskTool.setWmBrushSize,
      watermarkBrushMode: watermarkMaskTool.wmBrushMode,
      setWatermarkBrushMode: watermarkMaskTool.setWmBrushMode,
      hasWatermarkMask: watermarkMaskTool.hasMask,
      onClearWatermarkMask: watermarkMaskTool.clearMask,
      onApplyWatermarkRemoval: watermarkRemoval.executeRemoval,
      onCancelWatermarkRemoval: watermarkRemoval.deactivateWatermarkTool,
      isProcessingWatermark: watermarkRemoval.isProcessing,
      watermarkProgress: watermarkRemoval.progress,
      watermarkStatus: watermarkRemoval.status,
      brushHardness,
      setBrushHardness,
      brushOpacity,
      setBrushOpacity,
      brushColor,
      setBrushColor,
      stampSource,
      selection,
      selectionOffset,
      setSelectionOffset,
      marqueeSubTool,
      setMarqueeSubTool,
      selectionCombineMode,
      setSelectionCombineMode,
      magicWandTolerance,
      setMagicWandTolerance,
      magicWandAllowAlpha,
      setMagicWandAllowAlpha,
      textStyle,
      setTextStyle,
      textFontOptions: TEXT_FONT_OPTIONS,
      hasTextDraft,
      onApplyTextDraft: handleApplyTextDraft,
      onCancelTextDraft: handleCancelTextDraft,
      onClearSelection: clearSelection,
      onClearSelectionPixels: clearSelectionPixels,
      onInvertSelection: invertSelection,
      activePreset,
      presets,
      onSelectPreset: setActivePreset,
      onDeletePreset: deletePreset,
      pressureEnabled,
      onPressureToggle: setPressureEnabled,
      aspectRatio,
      setAspectRatio,
      cropArea,
      canObjectFit,
      selectAll: selectAllCrop,
      clearCrop,
      lockAspect,
      setLockAspect,
      cropSizePivot,
      setCropSizePivot,
      setCropSize,
      expandToSquare,
      fitToSquare,
      onObjectFit: handleObjectFitToActiveLayer,
      onApplyCrop: handleApplyCrop,
      isTransformActive: transformState.isActive,
      transformAspectRatio,
      setTransformAspectRatio,
      transformBounds: transformState.bounds,
      setTransformSizeByWidth,
      setTransformSizeByHeight,
      onApplyTransform: handleApplyTransform,
      cancelTransform,
      setToolMode,
    },
    toolOptionsTranslations: uiText.toolOptions,
  });

  const overlaysProps = useEditorOverlayModel({
    showExportModal,
    setShowExportModal,
    handleExportFromModal,
    exportMode,
    setExportMode,
    projectName,
    exportTranslations: uiText.exportModal,
    showBgRemovalConfirm,
    setShowBgRemovalConfirm,
    handleRemoveBackground,
    hasSelection: !!selection,
    bgRemovalQuality,
    setBgRemovalQuality: handleBgRemovalQualityChange,
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    backgroundRemovalTranslations: uiText.backgroundRemoval,
    showResampleModal: isResampleModalOpen,
    closeResampleModal,
    applyResample,
    resampleWidth,
    resampleHeight,
    setResampleWidth,
    setResampleHeight,
    resampleKeepAspect,
    toggleResampleKeepAspect,
    isResampling,
    resampleTranslations: {
      title: t.resampleAllResolution,
      width: "W",
      height: "H",
      keepAspect: "비율 유지",
      cancel: t.cancel,
      apply: t.confirm,
      applying: t.resampling,
    },
    showUpscaleConfirm,
    closeUpscaleConfirm,
    applyUpscale,
    upscaleScale,
    setUpscaleScale,
    isUpscaling,
    upscaleProgress,
    upscaleStatus,
    upscaleCurrentSize: (() => {
      if (!activeLayerId) return canvasSize;
      const c = layerCanvasesRef.current.get(activeLayerId);
      return c ? { width: c.width, height: c.height } : canvasSize;
    })(),
    upscaleTranslations: {
      title: "AI Upscale",
      cancel: t.cancel,
      confirm: t.confirm,
    },
    showTransformDiscardConfirm,
    handleTransformDiscardCancel,
    handleTransformDiscardConfirm,
    handleTransformApplyAndSwitch,
    transformDiscardTranslations: uiText.transformDiscard,
    showStatusBar: hasLayers,
    canvasSize,
    rotation,
    zoom,
    cropArea,
    selection,
    fileInputRef,
    handleFileSelect,
    isSaveModalOpen: saveDialogState.isOpen,
    saveModalInitialName: saveDialogState.initialName,
    saveModalInitialProjectGroup: saveDialogState.initialProjectGroup,
    saveModalProjectGroups: saveDialogState.existingProjectGroups,
    closeSaveModal: closeSaveDialog,
    submitSaveModal: submitSaveDialog,
    isSavingProject: isSaving,
    saveModalTranslations: {
      title: saveDialogState.mode === "saveAs" ? t.saveAs : t.save,
      name: t.fileName,
      project: t.project,
      defaultProject: "default",
      newProject: `${t.newProject}...`,
      newProjectName: t.projectName,
      cancel: t.cancel,
      save: saveDialogState.mode === "saveAs" ? t.saveAs : t.save,
    },
    isProjectListOpen,
    setIsProjectListOpen,
    savedProjects,
    currentProjectId,
    handleLoadProject,
    handleDeleteProject,
    storageInfo,
    isLoading,
    projectListTranslations: {
      ...uiText.projectList,
      project: t.project,
      allProjects: t.allProjects,
      defaultProject: "default",
    },
    showSyncDialog,
    localProjectCount,
    cloudProjectCount,
    handleKeepCloud,
    handleKeepLocal,
    handleCancelSync,
    textOverlay,
    showNewCanvasChoiceModal,
    setShowNewCanvasChoiceModal,
    showBlankCanvasSizeModal,
    setShowBlankCanvasSizeModal,
    onStartWithImage: handleStartWithImage,
    onOpenBlankCanvasSize: handleOpenBlankCanvasSize,
    onCreateBlankCanvas: createBlankCanvas,
    newCanvasChoiceTranslations: {
      title: t.new || "새로 만들기",
      importImage: t.importImage || "이미지 가져오기",
      blankCanvas: "빈 캔버스",
      cancel: t.cancel,
    },
    blankCanvasSizeTranslations: {
      title: "캔버스 크기",
      recommended: "추천 크기",
      custom: "직접 입력",
      width: "가로",
      height: "세로",
      history: "최근 사용",
      cancel: t.cancel,
      create: "만들기",
    },
  });

  return {
    layerContextValue,
    canvasContextValue,
    loadingOverlay: {
      isLoading: isAutosaveLoading,
      message: t.loading || "Loading...",
    },
    saveToast: {
      isSaving,
      saveCount,
      savingLabel: t.saving || "Saving…",
      savedLabel: t.saved || "Saved",
    },
    headerProps,
    showToolbars: toolbarModels.showToolbars,
    actionToolbarProps: toolbarModels.actionToolbarProps,
    toolOptionsBarProps: toolbarModels.toolOptionsBarProps,
    overlaysProps,
    watermarkRemoval,
    isPanLocked,
    togglePanLock,
  };
}
