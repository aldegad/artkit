"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useLanguage, useAuth, HeaderSlot } from "../../shared/contexts";
import { Tooltip, Select, Scrollbar } from "../../shared/components";
import {
  EditorToolMode,
  OutputFormat,
  SavedImageProject,
  UnifiedLayer,
  Point,
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
} from "../../domains/editor";
// IndexedDB storage functions are now used through storageProvider
import {
  getStorageProvider,
  hasLocalProjects,
  checkCloudProjects,
  uploadLocalProjectsToCloud,
  clearLocalProjects,
  clearCloudProjects,
} from "../../services/projectStorage";
import { SyncDialog } from "../../components/auth";
import {
  EditorLayoutProvider,
  useEditorLayout,
  EditorStateProvider,
  EditorRefsProvider,
  useEditorState,
  useEditorRefs,
} from "../../domains/editor/contexts";
import { useEditorLayoutStore } from "../../domains/editor/stores/editorLayoutStore";
import {
  EditorSplitContainer,
  EditorFloatingWindows,
  registerEditorPanelComponent,
  clearEditorPanelComponents,
} from "../../domains/editor/components/layout";

// Component that syncs zustand store with context (bidirectional)
function EditorLayoutSync() {
  const { openFloatingWindow, closeFloatingWindow, layoutState } = useEditorLayout();
  const zustandStore = useEditorLayoutStore();
  const isSyncingRef = useRef(false);

  // Sync zustand → context
  useEffect(() => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    const zustandPanelIds = zustandStore.floatingWindows.map((w) => w.panelId);
    const contextPanelIds = layoutState.floatingWindows.map((w) => w.panelId);

    // Open windows in context that exist in zustand but not in context
    zustandPanelIds.forEach((panelId) => {
      if (!contextPanelIds.includes(panelId)) {
        openFloatingWindow(panelId);
      }
    });

    // Close windows in context that don't exist in zustand
    layoutState.floatingWindows.forEach((cw) => {
      if (!zustandPanelIds.includes(cw.panelId)) {
        closeFloatingWindow(cw.id);
      }
    });

    // Use setTimeout to break the sync cycle
    setTimeout(() => {
      isSyncingRef.current = false;
    }, 0);
  }, [zustandStore.floatingWindows]);

  // Sync context → zustand (when user closes window via X button)
  useEffect(() => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    const contextPanelIds = layoutState.floatingWindows.map((w) => w.panelId);
    const zustandPanelIds = zustandStore.floatingWindows.map((w) => w.panelId);

    // If context has fewer windows, sync back to zustand
    zustandPanelIds.forEach((panelId) => {
      if (!contextPanelIds.includes(panelId)) {
        zustandStore.closeFloatingWindowByPanelId(panelId);
      }
    });

    setTimeout(() => {
      isSyncingRef.current = false;
    }, 0);
  }, [layoutState.floatingWindows]);

  return null;
}

// Inner component that accesses the layout context
function EditorDockableArea() {
  const { layoutState } = useEditorLayout();
  return (
    <>
      <EditorLayoutSync />
      <EditorSplitContainer node={layoutState.root} />
      <EditorFloatingWindows />
    </>
  );
}

type ToolMode = EditorToolMode;

// Main export - wraps with all providers
export default function ImageEditor() {
  return (
    <EditorStateProvider>
      <EditorRefsProvider>
        <ImageEditorContent />
      </EditorRefsProvider>
    </EditorStateProvider>
  );
}

// Inner component that uses contexts
function ImageEditorContent() {
  const { t } = useLanguage();
  const { user, isLoading: authLoading } = useAuth();

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

  // Transform discard confirmation state
  const [showTransformDiscardConfirm, setShowTransformDiscardConfirm] = useState(false);
  const pendingToolModeRef = useRef<EditorToolMode | null>(null);
  const previousToolModeRef = useRef<EditorToolMode | null>(null);

  // Get state and setters from context
  const {
    state: {
      canvasSize,
      rotation,
      outputFormat,
      quality,
      toolMode,
      zoom,
      pan,
      isSpacePressed,
      isPanLocked,
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
    setOutputFormat,
    setQuality,
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

  // Undo/Redo history - using extracted hook
  const { saveToHistory, undo, redo, clearHistory, historyRef, historyIndexRef } = useHistory({
    editCanvasRef,
    maxHistory: 50,
  });

  // Get display dimensions (considering rotation)
  const getDisplayDimensions = useCallback(() => {
    const width = rotation % 180 === 0 ? canvasSize.width : canvasSize.height;
    const height = rotation % 180 === 0 ? canvasSize.height : canvasSize.width;
    return { width, height };
  }, [rotation, canvasSize]);

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

  // Keyboard shortcuts - using extracted hook (gets state, setters, and refs from context)
  useKeyboardShortcuts({
    setIsAltPressed,
    setBrushSize,
    undo,
    redo,
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
    if (isPanLocked || isSpacePressed) return "hand";
    return toolMode;
  }, [isPanLocked, isSpacePressed, toolMode]);

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
  });

  // Canvas rendering - moved to useCanvasRendering hook
  // screenToImage and getMousePos are now provided by useCanvasInput hook
  // isInHandle, getActiveToolMode, useMouseHandlers moved above canvas rendering useEffect
  // Keyboard shortcuts - moved to useKeyboardShortcuts hook

  // Refs for wheel/touch handlers - direct ref updates for synchronous zoom/pan
  // This avoids React's batched state updates causing stale values in fast events
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  // Refs for wheel and touch handler cleanup
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);
  const touchHandlersRef = useRef<{
    start: ((e: TouchEvent) => void) | null;
    move: ((e: TouchEvent) => void) | null;
    end: ((e: TouchEvent) => void) | null;
  }>({ start: null, move: null, end: null });
  const currentCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Canvas ref callback to attach wheel and touch listeners when canvas is mounted
  const canvasRefCallback = useCallback((canvas: HTMLCanvasElement | null) => {
    // Remove listeners from previous canvas if exists
    if (currentCanvasRef.current) {
      if (wheelHandlerRef.current) {
        currentCanvasRef.current.removeEventListener("wheel", wheelHandlerRef.current);
        wheelHandlerRef.current = null;
      }
      if (touchHandlersRef.current.start) {
        currentCanvasRef.current.removeEventListener("touchstart", touchHandlersRef.current.start);
        currentCanvasRef.current.removeEventListener("touchmove", touchHandlersRef.current.move!);
        currentCanvasRef.current.removeEventListener("touchend", touchHandlersRef.current.end!);
        touchHandlersRef.current = { start: null, move: null, end: null };
      }
    }

    // Update the refs
    canvasRef.current = canvas;
    currentCanvasRef.current = canvas;

    if (canvas) {
      const wheelHandler = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const currentZoom = zoomRef.current;
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.max(0.1, Math.min(10, currentZoom * zoomFactor));

        const rect = canvas.getBoundingClientRect();
        // Convert CSS coordinates to canvas pixel coordinates
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;
        const scale = newZoom / currentZoom;

        // Zoom centered on cursor position
        // mouseX/Y is relative to canvas top-left, but pan is relative to canvas center
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Calculate new pan using ref (synchronous) for accurate fast zoom
        const currentPan = panRef.current;
        const newPan = {
          x: currentPan.x * scale + (1 - scale) * (mouseX - centerX),
          y: currentPan.y * scale + (1 - scale) * (mouseY - centerY),
        };

        // Update refs synchronously for fast consecutive events
        panRef.current = newPan;
        zoomRef.current = newZoom;

        // Trigger React render
        setPan(newPan);
        setZoom(newZoom);
      };

      wheelHandlerRef.current = wheelHandler;
      canvas.addEventListener("wheel", wheelHandler, { passive: false });

      // Touch pinch zoom state
      let lastTouchDistance = 0;
      let lastTouchCenter = { x: 0, y: 0 };
      let isPinching = false;

      const getTouchDistance = (touches: TouchList) => {
        if (touches.length < 2) return 0;
        const dx = touches[1].clientX - touches[0].clientX;
        const dy = touches[1].clientY - touches[0].clientY;
        return Math.sqrt(dx * dx + dy * dy);
      };

      const getTouchCenter = (touches: TouchList, rect: DOMRect, scaleX: number, scaleY: number) => {
        if (touches.length < 2) return { x: 0, y: 0 };
        const centerClientX = (touches[0].clientX + touches[1].clientX) / 2;
        const centerClientY = (touches[0].clientY + touches[1].clientY) / 2;
        return {
          x: (centerClientX - rect.left) * scaleX,
          y: (centerClientY - rect.top) * scaleY,
        };
      };

      const touchStartHandler = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          isPinching = true;
          lastTouchDistance = getTouchDistance(e.touches);
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          lastTouchCenter = getTouchCenter(e.touches, rect, scaleX, scaleY);
        }
      };

      const touchMoveHandler = (e: TouchEvent) => {
        if (!isPinching || e.touches.length !== 2) return;
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const newDistance = getTouchDistance(e.touches);
        const newCenter = getTouchCenter(e.touches, rect, scaleX, scaleY);

        // Calculate zoom
        const currentZoom = zoomRef.current;
        const zoomDelta = newDistance / lastTouchDistance;
        const newZoom = Math.max(0.1, Math.min(10, currentZoom * zoomDelta));
        const scale = newZoom / currentZoom;

        // Calculate pan delta (for two-finger drag)
        const panDeltaX = newCenter.x - lastTouchCenter.x;
        const panDeltaY = newCenter.y - lastTouchCenter.y;

        // Zoom centered on pinch center point
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Calculate new pan using ref (synchronous) for accurate fast zoom
        const currentPan = panRef.current;
        const newPan = {
          x: currentPan.x * scale + (1 - scale) * (lastTouchCenter.x - centerX) + panDeltaX,
          y: currentPan.y * scale + (1 - scale) * (lastTouchCenter.y - centerY) + panDeltaY,
        };

        // Update refs synchronously for fast consecutive events
        panRef.current = newPan;
        zoomRef.current = newZoom;

        // Trigger React render
        setPan(newPan);
        setZoom(newZoom);

        lastTouchDistance = newDistance;
        lastTouchCenter = newCenter;
      };

      const touchEndHandler = (e: TouchEvent) => {
        if (e.touches.length < 2) {
          isPinching = false;
        }
      };

      touchHandlersRef.current = {
        start: touchStartHandler,
        move: touchMoveHandler,
        end: touchEndHandler,
      };
      canvas.addEventListener("touchstart", touchStartHandler, { passive: false });
      canvas.addEventListener("touchmove", touchMoveHandler, { passive: false });
      canvas.addEventListener("touchend", touchEndHandler);
    }
  }, []);

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

  const exportImage = useCallback(() => {
    // Check if we have any layers to export
    if (layers.length === 0) return;

    const exportCanvas = document.createElement("canvas");
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    // Create composite canvas from all visible layers
    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = displayWidth;
    compositeCanvas.height = displayHeight;
    const compositeCtx = compositeCanvas.getContext("2d");
    if (!compositeCtx) return;

    // Draw all visible layers in order (bottom to top)
    layers.forEach((layer) => {
      if (!layer.visible) return;

      const layerCanvas = layerCanvasesRef.current.get(layer.id);
      if (!layerCanvas) return;

      // Apply layer opacity
      compositeCtx.globalAlpha = layer.opacity;
      compositeCtx.drawImage(layerCanvas, 0, 0);
      compositeCtx.globalAlpha = 1;
    });

    if (cropArea) {
      exportCanvas.width = Math.round(cropArea.width);
      exportCanvas.height = Math.round(cropArea.height);

      // Check if crop extends beyond canvas (canvas expand mode)
      const extendsLeft = cropArea.x < 0;
      const extendsTop = cropArea.y < 0;
      const extendsRight = cropArea.x + cropArea.width > displayWidth;
      const extendsBottom = cropArea.y + cropArea.height > displayHeight;
      const extendsCanvas = extendsLeft || extendsTop || extendsRight || extendsBottom;

      if (extendsCanvas) {
        // Fill with white background for JPEG (which doesn't support transparency)
        if (outputFormat === "jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, cropArea.width, cropArea.height);
        }
        // For PNG/WebP, leave transparent (canvas is transparent by default)

        // Calculate the intersection of crop area with canvas
        const srcX = Math.max(0, cropArea.x);
        const srcY = Math.max(0, cropArea.y);
        const srcRight = Math.min(displayWidth, cropArea.x + cropArea.width);
        const srcBottom = Math.min(displayHeight, cropArea.y + cropArea.height);
        const srcWidth = srcRight - srcX;
        const srcHeight = srcBottom - srcY;

        // Calculate destination position (where to draw in export canvas)
        const destX = srcX - cropArea.x;
        const destY = srcY - cropArea.y;

        // Only draw if there's actual intersection with canvas
        if (srcWidth > 0 && srcHeight > 0) {
          ctx.drawImage(
            compositeCanvas,
            srcX,
            srcY,
            srcWidth,
            srcHeight,
            destX,
            destY,
            srcWidth,
            srcHeight,
          );
        }
      } else {
        // Normal crop within canvas bounds
        ctx.drawImage(
          compositeCanvas,
          Math.round(cropArea.x),
          Math.round(cropArea.y),
          Math.round(cropArea.width),
          Math.round(cropArea.height),
          0,
          0,
          Math.round(cropArea.width),
          Math.round(cropArea.height),
        );
      }
    } else {
      exportCanvas.width = displayWidth;
      exportCanvas.height = displayHeight;
      // Fill with white background for JPEG
      if (outputFormat === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, displayWidth, displayHeight);
      }
      ctx.drawImage(compositeCanvas, 0, 0);
    }

    const mimeType =
      outputFormat === "webp" ? "image/webp" : outputFormat === "jpeg" ? "image/jpeg" : "image/png";

    exportCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
        link.href = url;
        link.download = `${projectName || "edited-image"}.${ext}`;
        link.click();
        URL.revokeObjectURL(url);
      },
      mimeType,
      quality,
    );
  }, [layers, layerCanvasesRef, cropArea, outputFormat, quality, projectName, getDisplayDimensions]);

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
          const localProjects = await (await import("../../utils/storage")).getAllImageProjects();
          const cloudProjects = await (await import("../../lib/firebase/firebaseStorage")).getAllProjectsFromFirebase(user.uid);

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
    historyRef.current = [];
    historyIndexRef.current = -1;
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
        if (layers.length > 0) {
          try {
            await handleSaveProject();
          } catch (error) {
            alert(`${t.saveFailed}: ${(error as Error).message}`);
          }
        }
      }
    };

    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [layers.length, handleSaveProject, t.saveFailed]);

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
    historyRef.current = [];
    historyIndexRef.current = -1;
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
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" strokeWidth={2} strokeDasharray="4 2" rx="1" />
        </svg>
      ),
    },
    {
      mode: "move",
      name: t.move,
      description: t.moveToolTip,
      keys: ["Drag: Move selection"],
      shortcut: "V",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {/* Move tool icon - four-way arrow */}
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m0-16l-3 3m3-3l3 3m-3 13l-3-3m3 3l3-3M4 12h16m-16 0l3-3m-3 3l3 3m13-3l-3-3m3 3l-3 3"
          />
        </svg>
      ),
    },
    {
      mode: "transform",
      name: "Transform",
      description: "Scale and move layer content",
      keys: ["⌘T: Enter transform", "⇧: Keep aspect ratio", "⌥: From center", "Enter: Apply", "Esc: Cancel"],
      shortcut: "T",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {/* Transform tool icon - bounding box with handles */}
          <rect x="4" y="4" width="16" height="16" strokeWidth={2} rx="1" />
          <circle cx="4" cy="4" r="2" fill="currentColor" />
          <circle cx="20" cy="4" r="2" fill="currentColor" />
          <circle cx="4" cy="20" r="2" fill="currentColor" />
          <circle cx="20" cy="20" r="2" fill="currentColor" />
        </svg>
      ),
    },
    {
      mode: "brush",
      name: t.brush,
      description: t.brushToolTip,
      keys: ["[ ]: Size -/+", "⇧: Straight line"],
      shortcut: "B",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      ),
    },
    {
      mode: "eraser",
      name: t.eraser,
      description: t.eraserToolTip,
      keys: ["[ ]: Size -/+"],
      shortcut: "E",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636l-1.414-1.414a2 2 0 00-2.828 0L3.636 14.707a2 2 0 000 2.829l2.828 2.828a2 2 0 002.829 0L19.778 9.879a2 2 0 000-2.829l-1.414-1.414zM9.172 20.485L3.515 14.83M15 9l-6 6"
          />
          <path strokeLinecap="round" strokeWidth={2} d="M3 21h18" />
        </svg>
      ),
    },
    {
      mode: "fill",
      name: t.fill,
      description: t.fillToolTip,
      keys: ["Click: Fill area"],
      shortcut: "G",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11V5a2 2 0 00-2-2H7a2 2 0 00-2 2v6M5 11l7 10 7-10H5z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 17c0 1.657-1.343 3-3 3s-3-1.343-3-3c0-2 3-5 3-5s3 3 3 5z"
          />
        </svg>
      ),
    },
    {
      mode: "eyedropper",
      name: t.eyedropper,
      description: t.eyedropperToolTip,
      keys: ["Click: Pick color", "⌥+Click: From any tool"],
      shortcut: "I",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 3.646a2.5 2.5 0 00-3.536 0l-1.06 1.061 3.535 3.536 1.061-1.061a2.5 2.5 0 000-3.536zM14.172 6.293l-8.586 8.586a2 2 0 00-.498.83l-1.06 3.535a.5.5 0 00.631.632l3.536-1.06a2 2 0 00.829-.499l8.586-8.586-3.438-3.438z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.5 21.5l-1-1" />
        </svg>
      ),
    },
    {
      mode: "stamp",
      name: t.cloneStamp,
      description: t.cloneStampToolTip,
      keys: ["⌥+Click: Set source", "Drag: Clone paint"],
      shortcut: "S",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v4M12 7c-3 0-6 1-6 4v1h12v-1c0-3-3-4-6-4zM4 14h16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM8 18v3M16 18v3"
          />
        </svg>
      ),
    },
    {
      mode: "crop",
      name: t.crop,
      description: t.cropToolTip,
      keys: ["Drag: Select area", "Enter: Apply crop"],
      shortcut: "C",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="square"
            strokeLinejoin="miter"
            strokeWidth={2}
            d="M6 2v4H2M6 6h12v12M18 22v-4h4M18 18H6V6"
          />
        </svg>
      ),
    },
    {
      mode: "hand",
      name: t.hand,
      description: t.handToolTip,
      keys: ["Drag: Pan canvas", "Space: Temp hand", "Wheel: Zoom"],
      shortcut: "H",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
          />
        </svg>
      ),
    },
    {
      mode: "zoom",
      name: t.zoomInOut,
      description: t.zoomToolTip,
      keys: ["Click: Zoom in", "⌥+Click: Zoom out", "Wheel: Zoom"],
      shortcut: "Z",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
          />
        </svg>
      ),
    },
  ];

  return (
    <EditorLayoutProvider>
    <EditorLayersProvider value={layerContextValue}>
    <EditorCanvasProvider value={canvasContextValue}>
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden">
      {/* Header Slot Content */}
      <HeaderSlot>
        {/* Title - Desktop only */}
        <h1 className="text-sm font-semibold hidden md:block whitespace-nowrap">{t.imageEditor}</h1>
        {/* Menu Bar - now in header */}
        <EditorMenuBarInner
          onNew={handleNewCanvas}
          onLoad={() => setIsProjectListOpen(true)}
          onSave={handleSaveProject}
          onSaveAs={handleSaveAsProject}
          onImportImage={() => fileInputRef.current?.click()}
          canSave={layers.length > 0}
          isLoading={isLoading || isSaving}
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
            view: t.view,
            window: t.window,
            new: t.new,
            load: t.load,
            save: t.save,
            saveAs: t.saveAs,
            importImage: t.importImage,
            layers: t.layers,
            showRulers: t.showRulers,
            showGuides: t.showGuides,
            lockGuides: t.lockGuides,
            snapToGuides: t.snapToGuides,
            clearGuides: t.clearGuides,
          }}
        />
        {layers.length > 0 && (
          <>
            <div className="h-4 w-px bg-border-default" />
            {/* Project name */}
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="px-2 py-0.5 bg-surface-secondary border border-border-default rounded text-xs w-16 md:w-24 focus:outline-none focus:border-accent-primary"
              placeholder={t.projectName}
            />
            <div className="flex-1" />
          </>
        )}
      </HeaderSlot>

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
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="7" r="3" strokeWidth={2} />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10c-4 0-6 2.5-6 5v2h12v-2c0-2.5-2-5-6-5z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeWidth={2}
                    strokeDasharray="2 2"
                    d="M3 21L21 3"
                  />
                </svg>
              </button>
            </Tooltip>
          </div>

          <div className="h-4 w-px bg-border-default mx-1" />

          {/* Undo/Redo */}
          <div className="flex items-center gap-0.5">
            <Tooltip content={`${t.undo} (Ctrl+Z)`}>
              <button
                onClick={() => { undo(); requestRender(); }}
                className="p-1 hover:bg-interactive-hover rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
              </button>
            </Tooltip>
            <Tooltip content={`${t.redo} (Ctrl+Shift+Z)`}>
              <button
                onClick={() => { redo(); requestRender(); }}
                className="p-1 hover:bg-interactive-hover rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6"
                  />
                </svg>
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
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </Tooltip>
            {showRotateMenu && (
              <div className="absolute top-full left-0 mt-1 bg-surface-primary border border-border-default rounded-lg shadow-lg z-50 p-1 min-w-max">
                <button
                  onClick={() => { rotate(-90); setShowRotateMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-interactive-hover rounded text-sm text-left"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                  {t.rotateLeft} 90°
                </button>
                <button
                  onClick={() => { rotate(90); setShowRotateMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-interactive-hover rounded text-sm text-left"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6"
                    />
                  </svg>
                  {t.rotateRight} 90°
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-border-default mx-1" />

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.max(0.1, z * 0.8))}
              className="p-1 hover:bg-interactive-hover rounded transition-colors"
              title={t.zoomOut}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(10, z * 1.25))}
              className="p-1 hover:bg-interactive-hover rounded transition-colors"
              title={t.zoomIn}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
            <button
              onClick={fitToScreen}
              className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
              title={t.fitToScreen}
            >
              Fit
            </button>
          </div>

          <div className="h-4 w-px bg-border-default mx-1" />

          {/* Output format */}
          <div className="flex items-center gap-1">
            <Select
              value={outputFormat}
              onChange={(value) => setOutputFormat(value as OutputFormat)}
              options={[
                { value: "png", label: "PNG" },
                { value: "webp", label: "WebP" },
                { value: "jpeg", label: "JPEG" },
              ]}
              size="sm"
            />
            {outputFormat !== "png" && (
              <>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={quality}
                  onChange={(e) => setQuality(parseFloat(e.target.value))}
                  className="w-12 accent-accent-primary"
                />
                <span className="text-xs w-6">{Math.round(quality * 100)}%</span>
              </>
            )}
          </div>

          <div className="flex-1 min-w-0" />

          <button
            onClick={clearEdits}
            className="px-2 py-1 bg-accent-warning hover:bg-accent-warning/80 text-white rounded text-xs transition-colors shrink-0 whitespace-nowrap"
            title={t.resetEdit}
          >
            {t.reset}
          </button>

          <button
            onClick={exportImage}
            className="px-2 py-1 bg-accent-success hover:bg-accent-success/80 text-white rounded text-xs transition-colors shrink-0 whitespace-nowrap"
          >
            Export
          </button>
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
        {/* Mobile Pan Mode Toggle - floating button */}
        {layers.length > 0 && (
          <div className="absolute bottom-4 right-4 z-50 md:hidden">
            <PanModeToggle />
          </div>
        )}
      </div>

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
    </EditorLayoutProvider>
  );
}

// ============================================
// EditorMenuBarInner - Uses zustand store for layer toggle (works outside Provider)
// ============================================

interface EditorMenuBarInnerProps {
  onNew: () => void;
  onLoad: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onImportImage: () => void;
  canSave: boolean;
  isLoading?: boolean;
  // View menu props
  showRulers: boolean;
  showGuides: boolean;
  lockGuides: boolean;
  snapToGuides: boolean;
  onToggleRulers: () => void;
  onToggleGuides: () => void;
  onToggleLockGuides: () => void;
  onToggleSnapToGuides: () => void;
  onClearGuides: () => void;
  translations: {
    file: string;
    view: string;
    window: string;
    new: string;
    load: string;
    save: string;
    saveAs: string;
    importImage: string;
    layers: string;
    showRulers: string;
    showGuides: string;
    lockGuides: string;
    snapToGuides: string;
    clearGuides: string;
  };
}

function EditorMenuBarInner(props: EditorMenuBarInnerProps) {
  // Use zustand store instead of context - works outside EditorLayoutProvider
  const { isPanelOpen, openFloatingWindow, closeFloatingWindowByPanelId } = useEditorLayoutStore();
  const isLayersOpen = isPanelOpen("layers");

  const handleToggleLayers = useCallback(() => {
    if (isLayersOpen) {
      closeFloatingWindowByPanelId("layers");
    } else {
      openFloatingWindow("layers");
    }
  }, [isLayersOpen, closeFloatingWindowByPanelId, openFloatingWindow]);

  return (
    <EditorMenuBar
      {...props}
      onToggleLayers={handleToggleLayers}
      isLayersOpen={isLayersOpen}
    />
  );
}
