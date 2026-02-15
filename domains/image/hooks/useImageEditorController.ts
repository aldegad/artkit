"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useCanvasViewport } from "@/shared/hooks/useCanvasViewport";
import { useSaveProjectDialog } from "@/shared/hooks";
import { useLanguage, useAuth } from "@/shared/contexts";
import { getStorageProvider } from "../services/projectStorage";
import {
  useEditorLayout,
  useEditorRefs,
  useEditorState,
} from "../contexts";
import { VIEWPORT } from "../constants";
import { useHistory, HistoryAdapter } from "./useHistory";
import { useLayerManagement } from "./useLayerManagement";
import { useBrushTool } from "./useBrushTool";
import { useCanvasInput } from "./useCanvasInput";
import { useSelectionTool } from "./tools/useSelectionTool";
import { useCropTool } from "./tools/useCropTool";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useMouseHandlers } from "./useMouseHandlers";
import { useCanvasRendering } from "./useCanvasRendering";
import { useBackgroundRemoval } from "./useBackgroundRemoval";
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
import { useViewportBridge } from "./useViewportBridge";
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
import { clearRectWithFeather } from "../utils/selectionFeather";
import { computeMagicWandSelection } from "@/shared/utils/magicWand";
import type {
  BackgroundRemovalModel,
  BackgroundRemovalQuality,
} from "@/shared/ai/backgroundRemoval";
import { readAISettings, updateAISettings } from "@/shared/ai/settings";
import { collectProjectGroupNames } from "@/shared/utils/projectGroups";

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
  const [bgRemovalQuality, setBgRemovalQuality] = useState<BackgroundRemovalQuality>(
    () => readAISettings().backgroundRemovalQuality
  );
  const [bgRemovalModel, setBgRemovalModel] = useState<BackgroundRemovalModel>(
    () => readAISettings().backgroundRemovalModel
  );

  const handleBgRemovalQualityChange = useCallback((quality: BackgroundRemovalQuality) => {
    setBgRemovalQuality(quality);
    updateAISettings({ backgroundRemovalQuality: quality });
  }, []);

  const handleBgRemovalModelChange = useCallback((model: BackgroundRemovalModel) => {
    setBgRemovalModel(model);
    updateAISettings({ backgroundRemovalModel: model });
  }, []);

  const { saveToHistory, undo, redo, clearHistory, canUndo, canRedo } = useHistory({
    editCanvasRef,
    historyAdapterRef,
    maxHistory: 50,
  });

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
      minZoom: VIEWPORT.MIN_ZOOM,
      maxZoom: VIEWPORT.MAX_ZOOM,
      wheelZoomFactor: VIEWPORT.WHEEL_ZOOM_FACTOR,
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
    setCanvasSize,
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
    duplicateLayer,
    rotateAllLayerCanvases,
    selectLayerWithModifier,
    clearLayerSelection,
    alignLayers,
    distributeLayers,
    initLayers,
    addLayer,
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

  const { getMousePos, screenToImage } = useCanvasInput({
    canvasRef,
    zoom,
    pan,
    getDisplayDimensions,
  });

  const {
    selection,
    setSelection,
    selectionFeather,
    setSelectionFeather,
    magicWandTolerance,
    setMagicWandTolerance,
    isMovingSelection,
    setIsMovingSelection,
    isDuplicating,
    setIsDuplicating,
    isAltPressed,
    setIsAltPressed,
    floatingLayerRef,
    clipboardRef,
    dragStartOriginRef,
  } = useSelectionTool({
    getDisplayDimensions,
    saveToHistory,
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
    guides,
    canvasSize,
    snapEnabled: snapToGuides,
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
    selectionFeather,
    saveToHistory,
  });

  const applyMagicWandSelection = useCallback((imageX: number, imageY: number) => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d", { willReadFrequently: true });
    if (!editCanvas || !ctx) {
      setSelection(null);
      floatingLayerRef.current = null;
      return;
    }

    const layerPosX = activeLayerPosition?.x || 0;
    const layerPosY = activeLayerPosition?.y || 0;
    const localX = Math.floor(imageX - layerPosX);
    const localY = Math.floor(imageY - layerPosY);

    if (localX < 0 || localY < 0 || localX >= editCanvas.width || localY >= editCanvas.height) {
      setSelection(null);
      floatingLayerRef.current = null;
      return;
    }

    const imageData = ctx.getImageData(0, 0, editCanvas.width, editCanvas.height);
    const wandSelection = computeMagicWandSelection(imageData, localX, localY, {
      tolerance: magicWandTolerance,
      connectedOnly: true,
      ignoreAlpha: true,
      colorMetric: "hsv",
    });

    if (!wandSelection) {
      setSelection(null);
      floatingLayerRef.current = null;
      return;
    }

    setSelection({
      x: wandSelection.bounds.x + layerPosX,
      y: wandSelection.bounds.y + layerPosY,
      width: wandSelection.bounds.width,
      height: wandSelection.bounds.height,
    });
    setIsMovingSelection(false);
    setIsDuplicating(false);
    floatingLayerRef.current = null;
  }, [
    editCanvasRef,
    activeLayerPosition,
    magicWandTolerance,
    setSelection,
    setIsMovingSelection,
    setIsDuplicating,
    floatingLayerRef,
  ]);

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
    selectionFeather,
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

  const { requestRender } = useCanvasRendering({
    layerCanvasesRef,
    floatingLayerRef,
    layers,
    cropArea,
    canvasExpandMode,
    mousePos,
    brushSize,
    brushHardness,
    brushColor,
    stampSource,
    activeLayerPosition,
    selection,
    isDuplicating,
    isMovingSelection,
    transformBounds: transformState.bounds,
    isTransformActive: transformState.isActive,
    transformLayerId: transformState.layerId,
    transformOriginalImageData: transformState.originalImageData,
    transformRotation: transformState.rotation,
    transformFlipX: transformState.flipX,
    isSelectionBasedTransform: transformState.isSelectionBased,
    guides,
    showGuides,
    lockGuides,
    activeSnapSources: transformSnapSources,
    guideDragPreview,
    getDisplayDimensions,
  });

  const clearSelectionPixels = useCallback(() => {
    if (!selection) return;

    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    const layerPosX = activeLayerPosition?.x || 0;
    const layerPosY = activeLayerPosition?.y || 0;
    const localX = Math.round(selection.x - layerPosX);
    const localY = Math.round(selection.y - layerPosY);
    const width = Math.max(1, Math.round(selection.width));
    const height = Math.max(1, Math.round(selection.height));

    saveToHistory();
    clearRectWithFeather(ctx, localX, localY, width, height, selectionFeather);
    floatingLayerRef.current = null;
    requestRender();
  }, [
    selection,
    editCanvasRef,
    activeLayerPosition,
    saveToHistory,
    selectionFeather,
    floatingLayerRef,
    requestRender,
  ]);

  const handleUndo = useCallback(() => {
    undo();
    requestRender();
  }, [undo, requestRender]);

  const handleRedo = useCallback(() => {
    redo();
    requestRender();
  }, [redo, requestRender]);

  historyAdapterRef.current = historyAdapter;

  useKeyboardShortcuts({
    setIsAltPressed,
    setBrushSize,
    undo: handleUndo,
    redo: handleRedo,
    selection,
    selectionFeather,
    setSelection,
    clearSelectionPixels,
    clipboardRef,
    floatingLayerRef,
    isTransformActive: transformState.isActive,
    cancelTransform,
    getDisplayDimensions,
    saveToHistory,
    activeLayerPosition,
    onToolModeChange: handleToolModeChange,
  });

  useRulerRenderSync({
    showRulers,
    requestRender,
  });

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
    quality: bgRemovalQuality,
    model: bgRemovalModel,
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
  const hasSelectedLayers = selectedLayerIds.length > 0 || activeLayerId !== null;
  const canUndoNow = canUndo();
  const canRedoNow = canRedo();
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
    showExportModal,
    setShowExportModal,
    exportMode,
    openProjectList,
    openExportSingle,
    openExportLayers,
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
    onExport: openExportSingle,
    onExportLayers: openExportLayers,
    onResampleAllResolution: openResampleModal,
    onToggleLayers: handleToggleLayers,
    isLayersOpen,
    canSave: hasLayers,
    hasSelectedLayers,
    canResample,
    isLoading: isLoading || isSaving || isResampling,
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
    toolButtonTranslations: t,
    actionToolbarConfig: {
      toolMode,
      onToolModeChange: handleToolModeChange,
      onOpenBackgroundRemoval: openBackgroundRemovalConfirm,
      isRemovingBackground,
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
      brushHardness,
      setBrushHardness,
      brushOpacity,
      setBrushOpacity,
      brushColor,
      setBrushColor,
      stampSource,
      selection,
      selectionFeather,
      setSelectionFeather,
      magicWandTolerance,
      setMagicWandTolerance,
      onClearSelectionPixels: clearSelectionPixels,
      activePreset,
      presets,
      onSelectPreset: setActivePreset,
      onDeletePreset: deletePreset,
      pressureEnabled,
      onPressureToggle: setPressureEnabled,
      aspectRatio,
      setAspectRatio,
      cropArea,
      selectAll: selectAllCrop,
      clearCrop,
      canvasExpandMode,
      setCanvasExpandMode,
      lockAspect,
      setLockAspect,
      setCropSize,
      expandToSquare,
      fitToSquare,
      onApplyCrop: handleApplyCrop,
      isTransformActive: transformState.isActive,
      transformAspectRatio,
      setTransformAspectRatio,
      transformBounds: transformState.bounds,
      setTransformSizeByWidth,
      setTransformSizeByHeight,
      onApplyTransform: applyTransform,
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
    projectName,
    exportTranslations: uiText.exportModal,
    showBgRemovalConfirm,
    setShowBgRemovalConfirm,
    handleRemoveBackground,
    hasSelection: !!selection,
    bgRemovalQuality,
    setBgRemovalQuality: handleBgRemovalQualityChange,
    bgRemovalModel,
    setBgRemovalModel: handleBgRemovalModelChange,
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
      name: t.projectName,
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
    isPanLocked,
    togglePanLock,
  };
}
