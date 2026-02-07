"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useCanvasViewport } from "@/shared/hooks/useCanvasViewport";
import { useLanguage, useAuth } from "@/shared/contexts";
import { HeaderContent, SaveToast, LoadingOverlay } from "@/shared/components";
import { Tooltip, Scrollbar, ExportModal, NumberScrubber } from "@/shared/components";
import {
  MarqueeIcon,
  MoveIcon,
  TransformIcon,
  BrushIcon,
  EraserIcon,
  FillBucketIcon,
  EyedropperIcon,
  CloneStampIcon,
  CropIcon,
  HandIcon,
  ZoomSearchIcon,
  BackgroundRemovalIcon,
  UndoIcon,
  RedoIcon,
  RotateIcon,
} from "@/shared/components/icons";
import {
  EditorToolMode,
  OutputFormat,
  SavedImageProject,
  UnifiedLayer,
  HistoryAdapter,
  GuideOrientation,
  createPaintLayer,
  ProjectListModal,
  loadEditorAutosaveData,
  clearEditorAutosaveData,
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
  BackgroundRemovalModals,
  TransformDiscardConfirmModal,
  EditorToolOptions,
  EditorStatusBar,
  PanModeToggle,
  EditorMenuBar,
  EditorLayersProvider,
  LayersPanelContent,
  EditorCanvasProvider,
  CanvasPanelContent,
} from "@/domains/image";
// IndexedDB storage functions are now used through storageProvider
import {
  getStorageProvider,
  hasLocalProjects,
  checkCloudProjects,
  uploadLocalProjectsToCloud,
  clearLocalProjects,
  clearCloudProjects,
} from "@/services/projectStorage";
import { SyncDialog } from "@/components/auth";
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
  registerEditorPanelComponent,
  clearEditorPanelComponents,
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

type ToolMode = EditorToolMode;

interface LayerCanvasHistoryState {
  layerId: string;
  width: number;
  height: number;
  imageData: ImageData;
}

interface EditorHistorySnapshot {
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  selectedLayerIds: string[];
  canvases: LayerCanvasHistoryState[];
}

function cloneLayerForHistory(layer: UnifiedLayer): UnifiedLayer {
  return {
    ...layer,
    position: layer.position ? { ...layer.position } : undefined,
    originalSize: layer.originalSize ? { ...layer.originalSize } : undefined,
  };
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
  const { user, isLoading: authLoading } = useAuth();

  // Layout context (Provider is above in ImageEditor)
  const { isPanelOpen, openFloatingWindow, closeFloatingWindow, layoutState } = useEditorLayout();
  const isLayersOpen = isPanelOpen("layers");

  const handleToggleLayers = useCallback(() => {
    if (isLayersOpen) {
      const win = layoutState.floatingWindows.find(w => w.panelId === "layers");
      if (win) closeFloatingWindow(win.id);
    } else {
      openFloatingWindow("layers");
    }
  }, [isLayersOpen, layoutState.floatingWindows, closeFloatingWindow, openFloatingWindow]);

  // Storage provider based on auth state
  const storageProvider = useMemo(() => getStorageProvider(user), [user]);

  // Sync dialog state
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [localProjectCount, setLocalProjectCount] = useState(0);
  const [cloudProjectCount, setCloudProjectCount] = useState(0);

  // Rotate menu state (for mobile)
  const [showRotateMenu, setShowRotateMenu] = useState(false);

  // Loading state for async operations
  const [isLoading, setIsLoading] = useState(false);
  const [isAutosaveLoading, setIsAutosaveLoading] = useState(true);
  const [saveCount, setSaveCount] = useState(0);

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMode, setExportMode] = useState<"single" | "layers">("single");

  // Transform discard confirmation state
  const [showTransformDiscardConfirm, setShowTransformDiscardConfirm] = useState(false);
  const pendingToolModeRef = useRef<EditorToolMode | null>(null);
  const previousToolModeRef = useRef<EditorToolMode | null>(null);

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

  // Track last synced values to prevent infinite sync loops
  const lastViewportSyncRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });

  // Forward sync: viewport (wheel/pinch) → context
  useEffect(() => {
    return viewport.onViewportChange((state) => {
      lastViewportSyncRef.current = { zoom: state.zoom, pan: { ...state.pan } };
      setZoom(state.zoom);
      setPan(state.pan);
    });
  }, [viewport, setZoom, setPan]);

  // Reverse sync: context (external changes like usePanZoomHandler, fitToScreen) → viewport
  useEffect(() => {
    const last = lastViewportSyncRef.current;
    if (zoom === last.zoom && pan.x === last.pan.x && pan.y === last.pan.y) return;
    lastViewportSyncRef.current = { zoom, pan: { ...pan } };
    viewport.updateTransform({ zoom, pan });
  }, [zoom, pan, viewport]);

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

  const captureEditorHistorySnapshot = useCallback((): EditorHistorySnapshot => {
    const canvases: LayerCanvasHistoryState[] = [];

    for (const layer of layers) {
      const canvas = layerCanvasesRef.current.get(layer.id);
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) continue;

      canvases.push({
        layerId: layer.id,
        width: canvas.width,
        height: canvas.height,
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
      });
    }

    return {
      layers: layers.map(cloneLayerForHistory),
      activeLayerId,
      selectedLayerIds: [...selectedLayerIds],
      canvases,
    };
  }, [layers, activeLayerId, selectedLayerIds, layerCanvasesRef]);

  const applyEditorHistorySnapshot = useCallback(
    (snapshot: EditorHistorySnapshot) => {
      const canvasMap = layerCanvasesRef.current;
      canvasMap.clear();

      snapshot.canvases.forEach((canvasState) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvasState.width;
        canvas.height = canvasState.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.putImageData(canvasState.imageData, 0, 0);
        }
        canvasMap.set(canvasState.layerId, canvas);
      });

      snapshot.layers.forEach((layer) => {
        if (canvasMap.has(layer.id)) return;

        const fallbackCanvas = document.createElement("canvas");
        fallbackCanvas.width = Math.max(1, layer.originalSize?.width || canvasSize.width || 1);
        fallbackCanvas.height = Math.max(1, layer.originalSize?.height || canvasSize.height || 1);
        canvasMap.set(layer.id, fallbackCanvas);
      });

      const restoredLayers = snapshot.layers.map(cloneLayerForHistory);
      const restoredLayerIds = new Set(restoredLayers.map((layer) => layer.id));
      const nextActiveLayerId =
        snapshot.activeLayerId && restoredLayerIds.has(snapshot.activeLayerId)
          ? snapshot.activeLayerId
          : restoredLayers[0]?.id || null;

      setLayers(restoredLayers);
      setActiveLayerId(nextActiveLayerId);
      setSelectedLayerIds(snapshot.selectedLayerIds.filter((layerId) => restoredLayerIds.has(layerId)));
      editCanvasRef.current = nextActiveLayerId ? canvasMap.get(nextActiveLayerId) || null : null;
    },
    [layerCanvasesRef, canvasSize.width, canvasSize.height, setLayers, setActiveLayerId, setSelectedLayerIds, editCanvasRef]
  );

  // Create layer context value for EditorLayersProvider
  const layerContextValue = useMemo(
    () => ({
      layers,
      setLayers,
      activeLayerId,
      setActiveLayerId,
      selectedLayerIds,
      setSelectedLayerIds,
      layerImages: new Map(), // Not used in this context but required by interface
      setLayerImages: () => {}, // Not used in this context but required by interface
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
    }),
    [
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
    ]
  );

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
  const { getMousePos, screenToImage, createInputEvent } = useCanvasInput({
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
    // Snap options
    guides,
    canvasSize,
    snapEnabled: snapToGuides,
    // Multi-layer support
    selectedLayerIds,
  });

  // Wrapper to intercept tool mode changes when transform is active
  const handleToolModeChange = useCallback((mode: EditorToolMode) => {
    // If transform is active and trying to switch to another tool, show confirmation
    if (transformState.isActive && mode !== "transform") {
      pendingToolModeRef.current = mode;
      setShowTransformDiscardConfirm(true);
      return;
    }
    // Save current tool before entering transform mode
    if (mode === "transform" && toolMode !== "transform") {
      previousToolModeRef.current = toolMode;
    }
    setToolMode(mode);
  }, [transformState.isActive, toolMode, setToolMode]);

  // Handle transform discard confirmation actions
  const handleTransformDiscardConfirm = useCallback(() => {
    cancelTransform();
    if (pendingToolModeRef.current) {
      setToolMode(pendingToolModeRef.current);
      pendingToolModeRef.current = null;
    }
    previousToolModeRef.current = null;
    setShowTransformDiscardConfirm(false);
  }, [cancelTransform, setToolMode]);

  const handleTransformApplyAndSwitch = useCallback(() => {
    applyTransform();
    if (pendingToolModeRef.current) {
      setToolMode(pendingToolModeRef.current);
      pendingToolModeRef.current = null;
    }
    previousToolModeRef.current = null;
    setShowTransformDiscardConfirm(false);
  }, [applyTransform, setToolMode]);

  const handleTransformDiscardCancel = useCallback(() => {
    pendingToolModeRef.current = null;
    setShowTransformDiscardConfirm(false);
  }, []);

  // ============================================
  // Fill Function
  // ============================================

  // Fill selection or entire canvas with color
  const fillWithColor = useCallback(() => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    saveToHistory();

    ctx.fillStyle = brushColor;

    if (selection) {
      // Fill selection area
      ctx.fillRect(
        Math.round(selection.x),
        Math.round(selection.y),
        Math.round(selection.width),
        Math.round(selection.height),
      );
    } else {
      // Fill entire canvas
      ctx.fillRect(0, 0, editCanvas.width, editCanvas.height);
    }
  }, [brushColor, selection, saveToHistory]);

  // Check if in active tool mode (considering space key for temporary hand tool)
  const getActiveToolMode = useCallback(() => {
    if (isSpacePressed) return "hand";
    return toolMode;
  }, [isSpacePressed, toolMode]);

  // Get active layer's position for coordinate conversion (brush drawing)
  const activeLayerPosition = useMemo(() => {
    const activeLayer = layers.find(l => l.id === activeLayerId);
    return activeLayer?.position || null;
  }, [layers, activeLayerId]);

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
    // Multi-layer support
    selectedLayerIds,
  });

  // Guide drag preview state for showing preview line on main canvas
  const [guideDragPreview, setGuideDragPreview] = useState<{ orientation: GuideOrientation; position: number } | null>(null);

  // Handler for guide drag state changes from Ruler
  const handleGuideDragStateChange = useCallback(
    (dragState: { orientation: GuideOrientation; position: number } | null) => {
      setGuideDragPreview(dragState);
    },
    []
  );

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
    activeLayerId,
    transformBounds: transformState.bounds,
    isTransformActive: transformState.isActive,
    transformLayerId: transformState.layerId,
    transformOriginalImageData: transformState.originalImageData,
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

  historyAdapterRef.current = {
    captureState: captureEditorHistorySnapshot,
    applyState: applyEditorHistorySnapshot,
  };

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

  // Re-render canvas when showRulers changes (container size changes due to ruler visibility)
  useEffect(() => {
    // Use setTimeout to ensure DOM has updated after ruler container change
    const timeoutId = setTimeout(() => {
      requestRender();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [showRulers, requestRender]);

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

  // Transform tool keyboard shortcuts and mode handling
  useEffect(() => {
    // Start transform when entering transform mode
    if (toolMode === "transform" && !transformState.isActive && activeLayerId) {
      startTransform();
    }
  }, [toolMode, transformState.isActive, activeLayerId, startTransform]);

  // Transform keyboard shortcuts (Enter to apply, Escape to cancel, Cmd+T to enter)
  useEffect(() => {
    const handleTransformKeys = (e: KeyboardEvent) => {
      // Skip if focus is on input elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Cmd+T to enter transform mode - prevent browser new tab first!
      if (e.code === "KeyT" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        if (activeLayerId && layers.length > 0) {
          // Save current tool before entering transform mode
          if (toolMode !== "transform") {
            previousToolModeRef.current = toolMode;
          }
          setToolMode("transform");
        }
        return;
      }

      // Only handle Enter/Escape when transform is active
      if (!transformState.isActive) return;

      if (e.code === "Enter") {
        e.preventDefault();
        applyTransform();
        // Return to previous tool after applying transform
        if (previousToolModeRef.current) {
          setToolMode(previousToolModeRef.current);
          previousToolModeRef.current = null;
        }
      }

      if (e.code === "Escape") {
        e.preventDefault();
        cancelTransform();
        // Return to previous tool after canceling transform
        if (previousToolModeRef.current) {
          setToolMode(previousToolModeRef.current);
          previousToolModeRef.current = null;
        } else {
          setToolMode("move"); // Default to move tool
        }
      }
    };

    // Use capture phase to intercept before browser handles Cmd+T
    window.addEventListener("keydown", handleTransformKeys, { capture: true });
    return () => window.removeEventListener("keydown", handleTransformKeys, { capture: true });
  }, [transformState.isActive, activeLayerId, layers.length, toolMode, applyTransform, cancelTransform, setToolMode]);

  // Load image from file
  const loadImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension

        // If no canvas exists, create new canvas with this image
        if (layers.length === 0) {
          setRotation(0);
          setCropArea(null);
          setZoom(1);
          setPan({ x: 0, y: 0 });
          setStampSource(null);

          const img = new Image();
          img.onload = () => {
            imageRef.current = img;
            setCanvasSize({ width: img.width, height: img.height });

            // Create a single paint layer with the image drawn on it
            const imageLayer = createPaintLayer(fileName, 0);
            imageLayer.originalSize = { width: img.width, height: img.height };

            // Create canvas and draw image
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
            }
            layerCanvasesRef.current.set(imageLayer.id, canvas);
            editCanvasRef.current = canvas;

            // Set layers and active layer
            setLayers([imageLayer]);
            setActiveLayerId(imageLayer.id);
          };
          img.src = src;
        } else {
          // Add as image layer to existing project
          addImageLayer(src, fileName);
        }
      };
      reader.readAsDataURL(file);
    },
    [addImageLayer, layers.length, t.layer],
  );

  // Handle file input
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadImageFile(file);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [loadImageFile],
  );

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) loadImageFile(file);
    },
    [loadImageFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Close rotate menu on outside click
  useEffect(() => {
    if (!showRotateMenu) return;
    const handleClickOutside = () => setShowRotateMenu(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showRotateMenu]);

  // Register panel components for the docking system
  useEffect(() => {
    // Register canvas panel - uses CanvasPanelContent which gets state from EditorCanvasContext
    registerEditorPanelComponent("canvas", () => <CanvasPanelContent />);

    // Register layers panel - uses LayersPanelContent which gets state from EditorLayersContext
    registerEditorPanelComponent("layers", () => <LayersPanelContent />);

    return () => {
      clearEditorPanelComponents();
    };
  }, []);

  // Canvas rendering - moved to useCanvasRendering hook
  // screenToImage and getMousePos are now provided by useCanvasInput hook
  // isInHandle, getActiveToolMode, useMouseHandlers moved above canvas rendering useEffect
  // Keyboard shortcuts - moved to useKeyboardShortcuts hook

  // Canvas ref callback - attaches shared viewport wheel/pinch handlers
  const canvasRefCallback = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    viewport.wheelRef(canvas);
    viewport.pinchRef(canvas);
  }, [canvasRef, viewport]);

  // Update crop area when aspect ratio changes - moved to useCropTool hook

  // Actions
  const rotate = (deg: number) => {
    const newRotation = (rotation + deg + 360) % 360;
    setRotation(newRotation);
    setCropArea(null);
    // Rotate all layer canvases to preserve drawn content
    rotateAllLayerCanvases(deg);
  };

  // Background removal handler - moved to useBackgroundRemoval hook
  // selectAllCrop and clearCrop - moved to useCropTool hook

  const clearEdits = () => {
    if (confirm(t.clearEditConfirm)) {
      const { width, height } = getDisplayDimensions();
      initLayers(width, height);
    }
  };

  const fitToScreen = () => {
    if (!containerRef.current || !canvasSize.width) return;
    const container = containerRef.current;
    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
    const padding = 40;
    const maxWidth = container.clientWidth - padding;
    const maxHeight = container.clientHeight - padding;
    const newZoom = Math.min(maxWidth / displayWidth, maxHeight / displayHeight, 1);
    setZoom(newZoom);
    setPan({ x: 0, y: 0 });
  };

  // Apply crop/canvas resize to actually change canvas size and continue editing
  const handleApplyCrop = useCallback(() => {
    if (!cropArea) return;

    // New canvas dimensions from crop area
    const newWidth = Math.round(cropArea.width);
    const newHeight = Math.round(cropArea.height);
    const offsetX = Math.round(cropArea.x);
    const offsetY = Math.round(cropArea.y);

    // Update each layer's canvas
    // Use setLayers to update layer positions after crop
    const updatedLayers = layers.map((layer) => {
      const oldCanvas = layerCanvasesRef.current.get(layer.id);
      if (!oldCanvas) return layer;

      // Get layer position (where layer is placed in image coordinates)
      const layerPosX = layer.position?.x || 0;
      const layerPosY = layer.position?.y || 0;

      // Create new canvas with new dimensions
      const newCanvas = document.createElement("canvas");
      newCanvas.width = newWidth;
      newCanvas.height = newHeight;
      const ctx = newCanvas.getContext("2d");
      if (!ctx) return layer;

      // Calculate crop area relative to layer's local coordinate system
      // Crop area (offsetX, offsetY) is in image coordinates
      // Layer canvas starts at (layerPosX, layerPosY) in image coordinates
      // So the crop area in layer-local coords is (offsetX - layerPosX, offsetY - layerPosY)
      const cropInLayerX = offsetX - layerPosX;
      const cropInLayerY = offsetY - layerPosY;

      // Calculate source region from layer canvas (in layer-local coordinates)
      const srcX = Math.max(0, cropInLayerX);
      const srcY = Math.max(0, cropInLayerY);
      const srcRight = Math.min(oldCanvas.width, cropInLayerX + newWidth);
      const srcBottom = Math.min(oldCanvas.height, cropInLayerY + newHeight);
      const srcWidth = Math.max(0, srcRight - srcX);
      const srcHeight = Math.max(0, srcBottom - srcY);

      // Destination: where to draw in new canvas
      // destX/Y accounts for when crop extends beyond the layer's bounds
      const destX = srcX - cropInLayerX;
      const destY = srcY - cropInLayerY;

      // Draw the portion of old canvas that intersects with crop area
      if (srcWidth > 0 && srcHeight > 0) {
        ctx.drawImage(
          oldCanvas,
          srcX, srcY, srcWidth, srcHeight,
          destX, destY, srcWidth, srcHeight
        );
      }

      // Replace the canvas in the ref
      layerCanvasesRef.current.set(layer.id, newCanvas);

      // Update editCanvasRef if this is the active layer
      if (layer.id === activeLayerId) {
        editCanvasRef.current = newCanvas;
      }

      // After crop, reset layer position to (0, 0)
      // because the new canvas is already positioned correctly within the new image bounds
      return {
        ...layer,
        position: { x: 0, y: 0 },
      };
    });

    // Update layers with new positions
    setLayers(updatedLayers);

    // Update canvas size in state
    setCanvasSize({ width: newWidth, height: newHeight });

    // Reset rotation to 0 since we're applying the crop at current rotation
    if (rotation !== 0) {
      setRotation(0);
    }

    // Clear crop area
    setCropArea(null);
    setCanvasExpandMode(false);

    // Save to history
    saveToHistory();

    // Fit to screen with new dimensions
    setTimeout(() => {
      const container = containerRef.current;
      if (container) {
        const padding = 40;
        const maxWidth = container.clientWidth - padding;
        const maxHeight = container.clientHeight - padding;
        const fitZoom = Math.min(maxWidth / newWidth, maxHeight / newHeight, 1);
        setZoom(fitZoom);
        setPan({ x: 0, y: 0 });
      }
    }, 0);
  }, [cropArea, layers, activeLayerId, rotation, setLayers, setCanvasSize, setRotation, saveToHistory, setZoom, setPan]);

  const exportImage = useCallback((fileName: string, fmt: OutputFormat, q: number) => {
    if (layers.length === 0) return;

    const exportCanvas = document.createElement("canvas");
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = displayWidth;
    compositeCanvas.height = displayHeight;
    const compositeCtx = compositeCanvas.getContext("2d");
    if (!compositeCtx) return;

    layers.forEach((layer) => {
      if (!layer.visible) return;
      const layerCanvas = layerCanvasesRef.current.get(layer.id);
      if (!layerCanvas) return;
      compositeCtx.globalAlpha = layer.opacity / 100;
      const posX = layer.position?.x || 0;
      const posY = layer.position?.y || 0;
      compositeCtx.drawImage(layerCanvas, posX, posY);
      compositeCtx.globalAlpha = 1;
    });

    if (cropArea) {
      exportCanvas.width = Math.round(cropArea.width);
      exportCanvas.height = Math.round(cropArea.height);

      const extendsLeft = cropArea.x < 0;
      const extendsTop = cropArea.y < 0;
      const extendsRight = cropArea.x + cropArea.width > displayWidth;
      const extendsBottom = cropArea.y + cropArea.height > displayHeight;
      const extendsCanvas = extendsLeft || extendsTop || extendsRight || extendsBottom;

      if (extendsCanvas) {
        if (fmt === "jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, cropArea.width, cropArea.height);
        }
        const srcX = Math.max(0, cropArea.x);
        const srcY = Math.max(0, cropArea.y);
        const srcRight = Math.min(displayWidth, cropArea.x + cropArea.width);
        const srcBottom = Math.min(displayHeight, cropArea.y + cropArea.height);
        const srcWidth = srcRight - srcX;
        const srcHeight = srcBottom - srcY;
        const destX = srcX - cropArea.x;
        const destY = srcY - cropArea.y;

        if (srcWidth > 0 && srcHeight > 0) {
          ctx.drawImage(compositeCanvas, srcX, srcY, srcWidth, srcHeight, destX, destY, srcWidth, srcHeight);
        }
      } else {
        ctx.drawImage(
          compositeCanvas,
          Math.round(cropArea.x), Math.round(cropArea.y),
          Math.round(cropArea.width), Math.round(cropArea.height),
          0, 0,
          Math.round(cropArea.width), Math.round(cropArea.height),
        );
      }
    } else {
      exportCanvas.width = displayWidth;
      exportCanvas.height = displayHeight;
      if (fmt === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, displayWidth, displayHeight);
      }
      ctx.drawImage(compositeCanvas, 0, 0);
    }

    const mimeType = fmt === "webp" ? "image/webp" : fmt === "jpeg" ? "image/jpeg" : "image/png";
    const ext = fmt === "jpeg" ? "jpg" : fmt;

    exportCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileName}.${ext}`;
        link.click();
        URL.revokeObjectURL(url);
      },
      mimeType,
      q,
    );
  }, [layers, layerCanvasesRef, cropArea, getDisplayDimensions]);

  // Export each selected layer individually at canvas size, bundled as ZIP
  const exportSelectedLayers = useCallback(async (fileName: string, fmt: OutputFormat, q: number, backgroundColor: string | null) => {
    const targetIds = selectedLayerIds.length > 0 ? selectedLayerIds : (activeLayerId ? [activeLayerId] : []);
    if (targetIds.length === 0) return;

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
    const mimeType = fmt === "webp" ? "image/webp" : fmt === "jpeg" ? "image/jpeg" : "image/png";
    const ext = fmt === "jpeg" ? "jpg" : fmt;

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    const blobPromises = targetIds.map((layerId) => {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return null;

      const layerCanvas = layerCanvasesRef.current.get(layerId);
      if (!layerCanvas) return null;

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = displayWidth;
      exportCanvas.height = displayHeight;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) return null;

      if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, displayWidth, displayHeight);
      } else if (fmt === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, displayWidth, displayHeight);
      }

      const posX = layer.position?.x || 0;
      const posY = layer.position?.y || 0;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layerCanvas, posX, posY);

      return new Promise<void>((resolve) => {
        exportCanvas.toBlob(
          (blob) => {
            if (blob) {
              zip.file(`${layer.name || "layer"}.${ext}`, blob);
            }
            resolve();
          },
          mimeType,
          q,
        );
      });
    });

    await Promise.all(blobPromises.filter(Boolean));

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  }, [layers, selectedLayerIds, activeLayerId, layerCanvasesRef, getDisplayDimensions]);

  // Handle export from modal
  const handleExportFromModal = useCallback((fileName: string, fmt: OutputFormat, q: number, backgroundColor: string | null) => {
    if (exportMode === "single") {
      exportImage(fileName, fmt, q);
    } else {
      exportSelectedLayers(fileName, fmt, q, backgroundColor);
    }
  }, [exportMode, exportImage, exportSelectedLayers]);

  // Get cursor based on tool mode
  const getCursor = () => {
    // Guide hover cursor (when guides visible and not locked)
    if (hoveredGuide && showGuides && !lockGuides) {
      return hoveredGuide.orientation === "horizontal" ? "ns-resize" : "ew-resize";
    }

    const activeMode = getActiveToolMode();
    if (activeMode === "hand") return isDragging ? "grabbing" : "grab";
    if (activeMode === "zoom") return "zoom-in";
    if (activeMode === "eyedropper") return "crosshair";
    if (activeMode === "fill") return "crosshair";
    // Only hide cursor when mouse is over the image (where brush preview is shown)
    if (activeMode === "brush" || activeMode === "eraser" || activeMode === "stamp") {
      return mousePos ? "none" : "crosshair";
    }
    if (activeMode === "marquee") {
      if (isDragging && isMovingSelection) {
        return isDuplicating ? "copy" : "move";
      }
      // Show copy cursor when hovering over selection with Alt pressed
      if (selection && isAltPressed && mousePos) {
        if (
          mousePos.x >= selection.x &&
          mousePos.x <= selection.x + selection.width &&
          mousePos.y >= selection.y &&
          mousePos.y <= selection.y + selection.height
        ) {
          return "copy";
        }
      }
      return "crosshair";
    }
    return "crosshair";
  };

  const displaySize = getDisplayDimensions();

  // Create canvas context value for EditorCanvasProvider
  const canvasContextValue = useMemo(
    () => ({
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
    }),
    [
      containerRef,
      canvasRefCallback,
      layers,
      handleDrop,
      handleDragOver,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleMouseLeave,
      loadImageFile,
      displaySize,
      addGuide,
      handleGuideDragStateChange,
    ]
  );

  // Load saved projects when storage provider changes (login/logout)
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const projects = await storageProvider.getAllProjects();
        setSavedProjects(projects);
        const info = await storageProvider.getStorageInfo();
        setStorageInfo(info);
      } catch (error) {
        console.error("Failed to load projects:", error);
      }
    };
    loadProjects();
  }, [storageProvider]);

  // Check for sync conflicts when user logs in
  useEffect(() => {
    const checkSyncConflicts = async () => {
      if (!user) return;

      try {
        const hasLocal = await hasLocalProjects();
        const hasCloud = await checkCloudProjects(user.uid);

        if (hasLocal && hasCloud) {
          // Both have data - show conflict dialog
          const localProjects = await (await import("@/utils/storage")).getAllImageProjects();
          const cloudProjects = await (await import("@/lib/firebase/firebaseStorage")).getAllProjectsFromFirebase(user.uid);

          setLocalProjectCount(localProjects.length);
          setCloudProjectCount(cloudProjects.length);
          setShowSyncDialog(true);
        } else if (hasLocal && !hasCloud) {
          // Only local data - auto upload to cloud
          await uploadLocalProjectsToCloud(user);
          // Refresh project list
          const projects = await storageProvider.getAllProjects();
          setSavedProjects(projects);
        }
        // If only cloud or neither - just use cloud storage (already handled by storageProvider)
      } catch (error) {
        console.error("Failed to check sync conflicts:", error);
      }
    };

    checkSyncConflicts();
  }, [user]);

  // ============================================
  // Auto-save/load functionality
  // ============================================
  const isInitializedRef = useRef(false);

  // Load autosave data on mount
  useEffect(() => {
    const loadAutosave = async () => {
      try {
        const data = await loadEditorAutosaveData();
        // Only restore if autosave has valid data
        if (data && data.layers && data.layers.length > 0 && data.canvasSize && layers.length === 0) {
          // Restore state from autosave
          setCanvasSize(data.canvasSize);
          setRotation(data.rotation);
          setZoom(data.zoom);
          setPan(data.pan);
          setProjectName(data.projectName);
          setActiveLayerId(data.activeLayerId);
          setBrushSize(data.brushSize);
          setBrushColor(data.brushColor);
          setBrushHardness(data.brushHardness);

          // Restore layers
          const { width, height } = data.canvasSize;
          await initLayers(width, height, data.layers);

          // Restore guides
          if (data.guides && data.guides.length > 0) {
            setGuides(data.guides);
          }

          // Restore UI state
          if (data.showRulers !== undefined) setShowRulers(data.showRulers);
          if (data.showGuides !== undefined) setShowGuides(data.showGuides);
          if (data.lockGuides !== undefined) setLockGuides(data.lockGuides);
          if (data.snapToGuides !== undefined) setSnapToGuides(data.snapToGuides);

          // Restore project identity (FIX: prevents creating new file on save after refresh)
          if (data.currentProjectId !== undefined) {
            setCurrentProjectId(data.currentProjectId);
          }
        } else if (data) {
          // Clear invalid/legacy autosave data
          clearEditorAutosaveData();
        }
      } catch (error) {
        console.error("Failed to load autosave:", error);
      }
      isInitializedRef.current = true;
      setIsAutosaveLoading(false);
    };
    loadAutosave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save is now handled by useEditorSave hook

  // Clear autosave when starting fresh
  const handleNewProject = useCallback(() => {
    clearEditorAutosaveData();
    setCanvasSize({ width: 0, height: 0 });
    setRotation(0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setProjectName("Untitled");
    setCurrentProjectId(null);
    setLayers([]);
    setActiveLayerId(null);
    setCropArea(null);
    setSelection(null);
    setStampSource(null);
    clearHistory();
    layerCanvasesRef.current.clear();
    editCanvasRef.current = null;
    imageRef.current = null;
  }, []);

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
    isInitialized: isInitializedRef.current,
  });

  // Cmd+S keyboard shortcut for save
  useEffect(() => {
    const handleSave = async (e: KeyboardEvent) => {
      if (e.code === "KeyS" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Cmd+S = Save As
          try {
            await handleSaveAsProject();
            setSaveCount((c) => c + 1);
          } catch (error) {
            alert(`${t.saveFailed}: ${(error as Error).message}`);
          }
        } else if (layers.length > 0) {
          try {
            await handleSaveProject();
            setSaveCount((c) => c + 1);
          } catch (error) {
            alert(`${t.saveFailed}: ${(error as Error).message}`);
          }
        }
      }
    };

    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [layers.length, handleSaveProject, handleSaveAsProject, t.saveFailed]);

  // Load a saved project
  const handleLoadProject = useCallback(
    async (projectMeta: SavedImageProject) => {
      setIsLoading(true);
      try {
        // Fetch full project data (including layer images) from storage
        const project = await storageProvider.getProject(projectMeta.id);
        if (!project) {
          alert("Failed to load project");
          return;
        }

        setProjectName(project.name);
        setCurrentProjectId(project.id);
        setRotation(project.rotation);
        setCanvasSize(project.canvasSize);
        setCropArea(null);
        setSelection(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setStampSource(null);

        // Initialize edit canvas with layers
        const { width, height } =
          project.rotation % 180 === 0
            ? project.canvasSize
            : { width: project.canvasSize.height, height: project.canvasSize.width };

        await initLayers(width, height, project.unifiedLayers);
        if (project.activeLayerId) {
          setActiveLayerId(project.activeLayerId);
          const activeLayer = project.unifiedLayers.find(l => l.id === project.activeLayerId);
          if (activeLayer?.type === "paint") {
            editCanvasRef.current = layerCanvasesRef.current.get(project.activeLayerId) || null;
          }
        }

        // Load guides
        setGuides(project.guides || []);

        setIsProjectListOpen(false);
      } finally {
        setIsLoading(false);
      }
    },
    [initLayers, storageProvider, setGuides],
  );

  // Delete a project
  const handleDeleteProject = useCallback(
    async (id: string) => {
      if (!confirm(t.deleteConfirm)) return;

      try {
        await storageProvider.deleteProject(id);
        const projects = await storageProvider.getAllProjects();
        setSavedProjects(projects);
        const info = await storageProvider.getStorageInfo();
        setStorageInfo(info);

        if (currentProjectId === id) {
          setCurrentProjectId(null);
        }
      } catch (error) {
        console.error("Failed to delete project:", error);
        alert(`${t.deleteFailed}: ${(error as Error).message}`);
      }
    },
    [currentProjectId, t, storageProvider],
  );

  // New canvas
  const handleNewCanvas = useCallback(() => {
    if (layers.length > 0 && !confirm(t.unsavedChangesConfirm)) return;

    // Clear autosave
    clearEditorAutosaveData();

    // Reset canvas state
    setCanvasSize({ width: 0, height: 0 });
    setProjectName("Untitled");
    setCurrentProjectId(null);
    setRotation(0);
    setCropArea(null);
    setSelection(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setStampSource(null);

    // Reset layers
    setLayers([]);
    setActiveLayerId(null);
    layerCanvasesRef.current.clear();

    // Reset refs
    imageRef.current = null;
    editCanvasRef.current = null;
    clearHistory();
  }, [layers.length, t]);

  const toolButtons: {
    mode: ToolMode;
    icon: React.ReactNode;
    name: string;
    description: string;
    keys?: string[];
    shortcut: string;
  }[] = [
    {
      mode: "marquee",
      name: t.marquee,
      description: t.marquee,
      keys: ["⌥+Drag: Clone", "⇧: Axis lock", "Delete: Clear"],
      shortcut: "M",
      icon: <MarqueeIcon className="w-4 h-4" />,
    },
    {
      mode: "move",
      name: t.move,
      description: t.moveToolTip,
      keys: ["Drag: Move selection"],
      shortcut: "V",
      icon: <MoveIcon className="w-4 h-4" />,
    },
    {
      mode: "transform",
      name: "Transform",
      description: "Scale and move layer content",
      keys: ["⌘T: Enter transform", "⇧: Keep aspect ratio", "⌥: From center", "Enter: Apply", "Esc: Cancel"],
      shortcut: "T",
      icon: <TransformIcon className="w-4 h-4" />,
    },
    {
      mode: "brush",
      name: t.brush,
      description: t.brushToolTip,
      keys: ["[ ]: Size -/+", "⇧: Straight line"],
      shortcut: "B",
      icon: <BrushIcon className="w-4 h-4" />,
    },
    {
      mode: "eraser",
      name: t.eraser,
      description: t.eraserToolTip,
      keys: ["[ ]: Size -/+"],
      shortcut: "E",
      icon: <EraserIcon className="w-4 h-4" />,
    },
    {
      mode: "fill",
      name: t.fill,
      description: t.fillToolTip,
      keys: ["Click: Fill area"],
      shortcut: "G",
      icon: <FillBucketIcon className="w-4 h-4" />,
    },
    {
      mode: "eyedropper",
      name: t.eyedropper,
      description: t.eyedropperToolTip,
      keys: ["Click: Pick color", "⌥+Click: From any tool"],
      shortcut: "I",
      icon: <EyedropperIcon className="w-4 h-4" />,
    },
    {
      mode: "stamp",
      name: t.cloneStamp,
      description: t.cloneStampToolTip,
      keys: ["⌥+Click: Set source", "Drag: Clone paint"],
      shortcut: "S",
      icon: <CloneStampIcon className="w-4 h-4" />,
    },
    {
      mode: "crop",
      name: t.crop,
      description: t.cropToolTip,
      keys: ["Drag: Select area", "Enter: Apply crop"],
      shortcut: "C",
      icon: <CropIcon className="w-4 h-4" />,
    },
    {
      mode: "hand",
      name: t.hand,
      description: t.handToolTip,
      keys: ["Drag: Pan canvas", "Space: Temp hand", "Wheel: Zoom"],
      shortcut: "H",
      icon: <HandIcon className="w-4 h-4" />,
    },
    {
      mode: "zoom",
      name: t.zoomInOut,
      description: t.zoomToolTip,
      keys: ["Click: Zoom in", "⌥+Click: Zoom out", "Wheel: Zoom"],
      shortcut: "Z",
      icon: <ZoomSearchIcon className="w-4 h-4" />,
    },
  ];

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
            onSave={async () => { await handleSaveProject(); setSaveCount((c) => c + 1); }}
            onSaveAs={async () => { await handleSaveAsProject(); setSaveCount((c) => c + 1); }}
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
        <Scrollbar
          className="bg-surface-primary border-b border-border-default shrink-0"
          overflow={{ x: "scroll", y: "hidden" }}
        >
          <div className="flex items-center gap-1 px-3.5 py-1 whitespace-nowrap">
          {/* Tool buttons */}
          <div className="flex gap-0.5 bg-surface-secondary rounded p-0.5">
            {toolButtons.map((tool) => (
              <Tooltip
                key={tool.mode}
                content={
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{tool.name}</span>
                    <span className="text-text-tertiary text-[11px]">{tool.description}</span>
                    {tool.keys && tool.keys.length > 0 && (
                      <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-border-default">
                        {tool.keys.map((key, i) => (
                          <span key={i} className="text-[10px] text-text-tertiary font-mono">
                            {key}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                }
                shortcut={tool.shortcut}
              >
                <button
                  onClick={() => handleToolModeChange(tool.mode)}
                  className={`p-1.5 rounded transition-colors ${
                    toolMode === tool.mode
                      ? "bg-accent-primary text-white"
                      : "hover:bg-interactive-hover"
                  }`}
                >
                  {tool.icon}
                </button>
              </Tooltip>
            ))}

            {/* Divider */}
            <div className="w-px bg-border-default mx-0.5" />

            {/* AI Background Removal */}
            <Tooltip
              content={
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{t.removeBackground}</span>
                  <span className="text-text-tertiary text-[11px]">
                    AI 모델을 사용해 이미지 배경을 제거합니다
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    첫 실행 시 모델 다운로드 (~30MB)
                  </span>
                </div>
              }
            >
              <button
                onClick={() => setShowBgRemovalConfirm(true)}
                disabled={isRemovingBackground}
                className={`p-1.5 rounded transition-colors ${
                  isRemovingBackground
                    ? "bg-accent-primary text-white cursor-wait"
                    : "hover:bg-interactive-hover"
                }`}
              >
                <BackgroundRemovalIcon className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>

          <div className="h-4 w-px bg-border-default mx-1" />

          {/* Undo/Redo */}
          <div className="flex items-center gap-0.5">
            <Tooltip content={`${t.undo} (Ctrl+Z)`}>
              <button
                onClick={handleUndo}
                className="p-1 hover:bg-interactive-hover rounded transition-colors"
              >
                <UndoIcon className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip content={`${t.redo} (Ctrl+Shift+Z)`}>
              <button
                onClick={handleRedo}
                className="p-1 hover:bg-interactive-hover rounded transition-colors"
              >
                <RedoIcon className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>

          <div className="h-4 w-px bg-border-default mx-1" />

          {/* Rotation dropdown */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <Tooltip content={t.rotate}>
              <button
                onClick={() => setShowRotateMenu(!showRotateMenu)}
                className={`p-1 hover:bg-interactive-hover rounded transition-colors ${showRotateMenu ? 'bg-interactive-hover' : ''}`}
              >
                <RotateIcon className="w-4 h-4" />
              </button>
            </Tooltip>
            {showRotateMenu && (
              <div className="absolute top-full left-0 mt-1 bg-surface-primary border border-border-default rounded-lg shadow-lg z-50 p-1 min-w-max">
                <button
                  onClick={() => { rotate(-90); setShowRotateMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-interactive-hover rounded text-sm text-left"
                >
                  <UndoIcon className="w-4 h-4" />
                  {t.rotateLeft} 90°
                </button>
                <button
                  onClick={() => { rotate(90); setShowRotateMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-interactive-hover rounded text-sm text-left"
                >
                  <RedoIcon className="w-4 h-4" />
                  {t.rotateRight} 90°
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-border-default mx-1" />

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <NumberScrubber
              value={zoom}
              onChange={setZoom}
              min={0.1}
              max={10}
              step={{ multiply: 1.25 }}
              format={(v) => `${Math.round(v * 100)}%`}
              size="sm"
              variant="zoom"
            />
            <button
              onClick={fitToScreen}
              className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
              title={t.fitToScreen}
            >
              Fit
            </button>
          </div>

          <div className="flex-1 min-w-0" />
          </div>
        </Scrollbar>
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
        onExport={handleExportFromModal}
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
        translations={{
          savedProjects: t.savedProjects || "저장된 프로젝트",
          noSavedProjects: t.noSavedProjects || "저장된 프로젝트가 없습니다",
          delete: t.delete,
        }}
      />

      {/* Sync Dialog */}
      <SyncDialog
        isOpen={showSyncDialog}
        localCount={localProjectCount}
        cloudCount={cloudProjectCount}
        onKeepCloud={async () => {
          // Keep cloud data, clear local
          await clearLocalProjects();
          setShowSyncDialog(false);
        }}
        onKeepLocal={async () => {
          // Upload local to cloud, overwrite cloud
          if (user) {
            await clearCloudProjects(user);
            await uploadLocalProjectsToCloud(user);
          }
          setShowSyncDialog(false);
        }}
        onCancel={() => {
          setShowSyncDialog(false);
        }}
      />
    </div>
    </EditorCanvasProvider>
    </EditorLayersProvider>
  );
}

