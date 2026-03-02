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
import { getDisplayDimensions as getRotatedDisplayDimensions } from "../utils/coordinateSystem";
import { getLayerContentBounds } from "../utils/layerContentBounds";
import { drawLayerWithOptionalAlphaMask } from "@/shared/utils/layerAlphaMask";
import {
  computeMagicWandSelectionFromAlphaMask,
  toMagicWandBoundsMask,
} from "@/shared/utils/magicWand";
import {
  useMagicWandSelectionAction,
  useClearSelectionPixelsAction,
} from "./useImageSelectionActions";
import type {
  BackgroundRemovalQuality,
} from "@/shared/ai/backgroundRemoval";
import { readAISettings, updateAISettings } from "@/shared/ai/settings";
import { collectProjectGroupNames } from "@/shared/utils/projectGroups";

const LAYER_PIXEL_SELECTION_ALPHA_THRESHOLD = 16;

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

  const handleBgRemovalQualityChange = useCallback((quality: BackgroundRemovalQuality) => {
    setBgRemovalQuality(quality);
    updateAISettings({ backgroundRemovalQuality: quality });
  }, []);

  const { saveToHistory, undo, redo, clearHistory, canUndo, canRedo } = useHistory({
    editCanvasRef,
    historyAdapterRef,
    maxHistory: 50,
  });

  const displayDimensions = useMemo(
    () => getRotatedDisplayDimensions(canvasSize, rotation),
    [canvasSize, rotation]
  );
  const getDisplayDimensions = useCallback(() => displayDimensions, [displayDimensions]);
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
    cropSizePivot,
    setCropSizePivot,
    selectAllCrop,
    clearCrop,
    getAspectRatioValue,
    setCropSize,
    expandToSquare,
    fitToSquare,
    fitToObjectBounds,
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
    selectionOffset,
    setSelectionOffset,
    marqueeSubTool,
    setMarqueeSubTool,
    lassoPath,
    setLassoPath,
    selectionMask,
    setSelectionMask,
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

  const applyMagicWandSelection = useMagicWandSelectionAction({
    activeLayerId,
    editCanvasRef,
    activeLayerPosition,
    magicWandTolerance,
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
    marqueeSubTool,
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
    selectionMask,
    marqueeSubTool,
    lassoPath,
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

  const clearSelectionPixels = useClearSelectionPixelsAction({
    selection,
    selectionMask,
    selectionFeather,
    editCanvasRef,
    activeLayerPosition,
    floatingLayerRef,
    saveToHistory,
    requestRender,
  });

  const invertSelection = useCallback(() => {
    const { width, height } = getDisplayDimensions();
    if (width <= 0 || height <= 0) return;

    const fullMask = new Uint8Array(width * height);
    const writeMaskPixel = (x: number, y: number, alpha: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const idx = y * width + x;
      if (alpha > fullMask[idx]) {
        fullMask[idx] = alpha;
      }
    };

    if (selection) {
      if (selectionMask) {
        for (let y = 0; y < selectionMask.height; y += 1) {
          for (let x = 0; x < selectionMask.width; x += 1) {
            const alpha = selectionMask.mask[y * selectionMask.width + x];
            if (alpha <= 0) continue;
            writeMaskPixel(selectionMask.x + x, selectionMask.y + y, alpha);
          }
        }
      } else {
        const minX = Math.max(0, Math.floor(selection.x));
        const minY = Math.max(0, Math.floor(selection.y));
        const maxX = Math.min(width, Math.ceil(selection.x + selection.width));
        const maxY = Math.min(height, Math.ceil(selection.y + selection.height));
        for (let y = minY; y < maxY; y += 1) {
          for (let x = minX; x < maxX; x += 1) {
            writeMaskPixel(x, y, 255);
          }
        }
      }
    } else {
      fullMask.fill(255);
    }

    for (let i = 0; i < fullMask.length; i += 1) {
      fullMask[i] = 255 - fullMask[i];
    }

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (fullMask[y * width + x] === 0) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) {
      setSelection(null);
      setSelectionMask(null);
      setLassoPath(null);
      setIsMovingSelection(false);
      setIsDuplicating(false);
      floatingLayerRef.current = null;
      requestRender();
      return;
    }

    const maskWidth = maxX - minX + 1;
    const maskHeight = maxY - minY + 1;
    const nextMask = new Uint8Array(maskWidth * maskHeight);
    for (let y = 0; y < maskHeight; y += 1) {
      const srcStart = (minY + y) * width + minX;
      nextMask.set(fullMask.subarray(srcStart, srcStart + maskWidth), y * maskWidth);
    }

    setSelection({
      x: minX,
      y: minY,
      width: maskWidth,
      height: maskHeight,
    });
    setSelectionMask({
      x: minX,
      y: minY,
      width: maskWidth,
      height: maskHeight,
      mask: nextMask,
    });
    setLassoPath(null);
    setIsMovingSelection(false);
    setIsDuplicating(false);
    floatingLayerRef.current = null;
    requestRender();
  }, [
    getDisplayDimensions,
    selection,
    selectionMask,
    setSelection,
    setSelectionMask,
    setLassoPath,
    setIsMovingSelection,
    setIsDuplicating,
    floatingLayerRef,
    requestRender,
  ]);

  const selectLayerPixelsToSelection = useCallback((layerId: string) => {
    const clearSelectionState = () => {
      setSelection(null);
      setSelectionMask(null);
      setLassoPath(null);
      setIsMovingSelection(false);
      setIsDuplicating(false);
      floatingLayerRef.current = null;
      requestRender();
    };

    const layer = layers.find((item) => item.id === layerId);
    const layerCanvas = layerCanvasesRef.current.get(layerId);
    if (!layer || !layerCanvas || layerCanvas.width <= 0 || layerCanvas.height <= 0) {
      clearSelectionState();
      return;
    }

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = layerCanvas.width;
    sampleCanvas.height = layerCanvas.height;
    const sampleCtx = sampleCanvas.getContext("2d");
    if (!sampleCtx) {
      clearSelectionState();
      return;
    }

    drawLayerWithOptionalAlphaMask(sampleCtx, layerCanvas, 0, 0);
    const imageData = sampleCtx.getImageData(0, 0, layerCanvas.width, layerCanvas.height);
    let seedIndex = -1;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i + 3] > LAYER_PIXEL_SELECTION_ALPHA_THRESHOLD) {
        seedIndex = i / 4;
        break;
      }
    }

    if (seedIndex < 0) {
      clearSelectionState();
      return;
    }

    const seedX = seedIndex % layerCanvas.width;
    const seedY = Math.floor(seedIndex / layerCanvas.width);
    const layerSelection = computeMagicWandSelectionFromAlphaMask(imageData, seedX, seedY, {
      alphaThreshold: LAYER_PIXEL_SELECTION_ALPHA_THRESHOLD,
      connectedOnly: false,
    });

    if (!layerSelection) {
      clearSelectionState();
      return;
    }

    const mask = toMagicWandBoundsMask(layerSelection);
    const layerPosX = layer.position?.x || 0;
    const layerPosY = layer.position?.y || 0;
    setSelection({
      x: mask.x + layerPosX,
      y: mask.y + layerPosY,
      width: mask.width,
      height: mask.height,
    });
    setSelectionMask({
      x: mask.x + layerPosX,
      y: mask.y + layerPosY,
      width: mask.width,
      height: mask.height,
      mask: mask.mask,
    });
    setLassoPath(null);
    setIsMovingSelection(false);
    setIsDuplicating(false);
    floatingLayerRef.current = null;
    requestRender();
  }, [
    layers,
    layerCanvasesRef,
    setSelection,
    setSelectionMask,
    setLassoPath,
    setIsMovingSelection,
    setIsDuplicating,
    floatingLayerRef,
    requestRender,
  ]);

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
    resizeSelectedLayersToSmallest,
    selectLayerWithModifier,
    selectLayerPixelsToSelection,
    clearLayerSelection,
    alignLayers,
    distributeLayers,
    initLayers,
    addLayer,
  });

  const handleUndo = useCallback(() => {
    undo();
    requestRender();
  }, [undo, requestRender]);

  const handleRedo = useCallback(() => {
    redo();
    requestRender();
  }, [redo, requestRender]);

  const handleResizeSelectedLayersToSmallest = useCallback(() => {
    resizeSelectedLayersToSmallest();
    requestRender();
  }, [resizeSelectedLayersToSmallest, requestRender]);

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
  const canUndoNow = canUndo();
  const canRedoNow = canRedo();
  const canResample = hasLayers && canvasSize.width > 0 && canvasSize.height > 0;
  const canResizeSelectedLayersToSmallest = selectedLayerIds.length > 1;
  const canObjectFit = activeLayerId !== null;
  const handleObjectFitToActiveLayer = useCallback(() => {
    if (!activeLayerId) return;
    const activeLayer = layers.find((layer) => layer.id === activeLayerId);
    if (!activeLayer) return;

    const activeCanvas = layerCanvasesRef.current.get(activeLayerId) || null;
    const bounds = getLayerContentBounds(activeLayer, activeCanvas);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

    fitToObjectBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  }, [activeLayerId, layers, layerCanvasesRef, fitToObjectBounds]);

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
    onToggleLayers: handleToggleLayers,
    isLayersOpen,
    canSave: hasLayers,
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
      selectionOffset,
      setSelectionOffset,
      marqueeSubTool,
      setMarqueeSubTool,
      magicWandTolerance,
      setMagicWandTolerance,
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
