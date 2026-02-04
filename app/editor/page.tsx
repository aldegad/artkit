"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useLanguage } from "../../shared/contexts";
import { Tooltip, ImageDropZone } from "../../shared/components";
import {
  EditorToolMode,
  OutputFormat,
  SavedImageProject,
  UnifiedLayer,
  Point,
  createPaintLayer,
  ProjectListModal,
  loadEditorAutosaveData,
  saveEditorAutosaveData,
  clearEditorAutosaveData,
  EDITOR_AUTOSAVE_DEBOUNCE_MS,
  useHistory,
  useLayerManagement,
  useBrushTool,
  useCanvasInput,
  useSelectionTool,
  useCropTool,
  useKeyboardShortcuts,
  useMouseHandlers,
  EditorToolOptions,
  EditorStatusBar,
} from "../../domains/editor";
import {
  saveImageProject,
  getAllImageProjects,
  deleteImageProject,
  getStorageInfo,
} from "../../utils/storage";
import { removeBackground } from "../../utils/backgroundRemoval";
import { EditorLayoutProvider, useEditorLayout } from "../../domains/editor/contexts/EditorLayoutContext";
import {
  EditorSplitContainer,
  EditorFloatingWindows,
  registerEditorPanelComponent,
  clearEditorPanelComponents,
} from "../../domains/editor/components/layout";

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

export default function ImageEditor() {
  const { t } = useLanguage();
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [rotation, setRotation] = useState(0);
  // cropArea and aspectRatio - moved to useCropTool hook
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("png");
  const [quality, setQuality] = useState(0.9);
  // isDragging, dragStart, dragType, resizeHandle - moved to useMouseHandlers hook

  // Tool & View state
  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Brush/Eraser state - moved to useBrushTool hook below

  // Project management state
  const [projectName, setProjectName] = useState("Untitled");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedImageProject[]>([]);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    used: number;
    quota: number;
    percentage: number;
  }>({ used: 0, quota: 0, percentage: 0 });

  // Clone stamp state - moved to useBrushTool hook

  // Background removal state
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [bgRemovalProgress, setBgRemovalProgress] = useState(0);
  const [bgRemovalStatus, setBgRemovalStatus] = useState("");
  const [showBgRemovalConfirm, setShowBgRemovalConfirm] = useState(false);

  // mousePos - moved to useMouseHandlers hook

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit canvas stores all paint operations
  const editCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
    selectAllCrop,
    clearCrop,
    getAspectRatioValue,
    getCropHandleAtPosition,
    moveCrop,
    resizeCrop,
    startCrop,
    updateCrop,
    validateCrop,
  } = useCropTool({
    getDisplayDimensions,
  });

  // Layer management - using extracted hook
  const {
    layers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
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
    renameLayer,
    toggleLayerLock,
    moveLayer,
    reorderLayers,
    mergeLayerDown,
    duplicateLayer,
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

  // Alias initLayers as initEditCanvas for backward compatibility
  const initEditCanvas = initLayers;

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
    drawOnEditCanvas,
    pickColor,
    resetLastDrawPoint,
  } = useBrushTool({
    editCanvasRef,
    getDisplayDimensions,
    imageRef,
    canvasSize,
    rotation,
    toolMode,
  });

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
    editCanvasRef,
    imageRef,
    getDisplayDimensions,
    getRotation: () => rotation,
    getCanvasSize: () => canvasSize,
    saveToHistory,
  });

  // Keyboard shortcuts - using extracted hook
  useKeyboardShortcuts({
    setToolMode,
    setIsSpacePressed,
    setIsAltPressed,
    setBrushSize,
    setZoom,
    setPan,
    undo,
    redo,
    selection,
    setSelection,
    clipboardRef,
    floatingLayerRef,
    canvasRef,
    imageRef,
    editCanvasRef,
    getDisplayDimensions,
    rotation,
    canvasSize,
    saveToHistory,
    isProjectListOpen,
    setIsProjectListOpen,
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
    if (isSpacePressed) return "hand";
    return toolMode;
  }, [isSpacePressed, toolMode]);

  // Mouse handlers - using extracted hook
  const {
    isDragging,
    mousePos,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
  } = useMouseHandlers({
    layers,
    getActiveToolMode,
    zoom,
    setZoom: (z) => setZoom(z),
    pan,
    setPan,
    canvasRef,
    editCanvasRef,
    imageRef,
    getDisplayDimensions,
    canvasSize,
    rotation,
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
    saveToHistory,
    fillWithColor,
  });

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

  // Register panel components for the docking system
  useEffect(() => {
    // Register canvas panel
    registerEditorPanelComponent("canvas", () => (
      <div
        ref={containerRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="w-full h-full overflow-hidden bg-surface-secondary relative"
      >
        {layers.length === 0 ? (
          <ImageDropZone
            variant="editor"
            onFileSelect={(files) => files[0] && loadImageFile(files[0])}
          />
        ) : (
          <canvas
            ref={canvasRefCallback}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            className="w-full h-full"
            style={{ cursor: getCursor(), imageRendering: "pixelated" }}
          />
        )}
      </div>
    ));

    // Register layers panel
    registerEditorPanelComponent("layers", () => (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Panel Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-default bg-surface-secondary shrink-0">
          <div className="flex items-center gap-1">
            {/* Add Paint Layer */}
            <button
              onClick={addPaintLayer}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
              title={t.addLayer}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            {/* Add Image Layer */}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadImageFile(file);
                e.target.value = "";
              }}
              className="hidden"
              id="dock-layer-file-input"
            />
            <button
              onClick={() => document.getElementById("dock-layer-file-input")?.click()}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
              title="Add Image Layer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>
        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {layers.length === 0 ? (
            <div className="text-center py-8 text-text-tertiary text-sm">
              <p>{t.noLayersYet}</p>
              <p className="text-xs mt-1">{t.clickAddLayerToStart}</p>
            </div>
          ) : (
            [...layers]
              .sort((a, b) => b.zIndex - a.zIndex)
              .map((layer) => (
                <div
                  key={layer.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggedLayerId(layer.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedLayerId && draggedLayerId !== layer.id) {
                      setDragOverLayerId(layer.id);
                    }
                  }}
                  onDragLeave={() => {
                    setDragOverLayerId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedLayerId && draggedLayerId !== layer.id) {
                      reorderLayers(draggedLayerId, layer.id);
                    }
                    setDraggedLayerId(null);
                    setDragOverLayerId(null);
                  }}
                  onDragEnd={() => {
                    setDraggedLayerId(null);
                    setDragOverLayerId(null);
                  }}
                  onClick={() => selectLayer(layer.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-grab active:cursor-grabbing transition-all ${
                    activeLayerId === layer.id
                      ? "bg-accent-primary/20 border border-accent-primary/50"
                      : "hover:bg-interactive-hover border border-transparent"
                  } ${
                    draggedLayerId === layer.id ? "opacity-50 scale-95" : ""
                  } ${
                    dragOverLayerId === layer.id ? "border-accent-primary! bg-accent-primary/10 scale-105" : ""
                  }`}
                >
                  {/* Visibility toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLayerVisibility(layer.id);
                    }}
                    className={`p-1 rounded ${layer.visible ? "text-text-primary" : "text-text-quaternary"}`}
                    title={layer.visible ? t.hideLayer : t.showLayer}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {layer.visible ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      )}
                    </svg>
                  </button>

                  {/* Layer thumbnail */}
                  <div className="w-10 h-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PHJlY3Qgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iI2NjYyIvPjxyZWN0IHg9IjgiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNjY2MiLz48L3N2Zz4=')] border border-border-default rounded overflow-hidden shrink-0 flex items-center justify-center">
                    <svg className="w-5 h-5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>

                  {/* Layer name */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={layer.name}
                      onChange={(e) => renameLayer(layer.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-xs bg-transparent border-none focus:outline-none focus:bg-surface-secondary px-1 rounded truncate"
                    />
                    <span className="text-[10px] text-text-quaternary px-1">
                      Layer
                    </span>
                  </div>

                  {/* Layer actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerLock(layer.id);
                      }}
                      className={`p-1 rounded ${layer.locked ? "text-accent-warning" : "text-text-quaternary hover:text-text-primary"}`}
                      title={layer.locked ? t.unlockLayer : t.lockLayer}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {layer.locked ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        )}
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateLayer(layer.id);
                      }}
                      className="p-1 rounded text-text-quaternary hover:text-text-primary"
                      title={t.duplicateLayer}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteLayer(layer.id);
                      }}
                      className="p-1 rounded text-text-quaternary hover:text-accent-danger"
                      title={t.deleteLayer}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>
        {/* Panel Footer - Opacity control */}
        {activeLayerId && layers.find(l => l.id === activeLayerId) && (
          <div className="px-3 py-2 border-t border-border-default bg-surface-secondary shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">{t.opacity}:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={layers.find(l => l.id === activeLayerId)?.opacity || 100}
                onChange={(e) => updateLayerOpacity(activeLayerId, Number(e.target.value))}
                className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-text-secondary w-8 text-right">
                {layers.find(l => l.id === activeLayerId)?.opacity || 100}%
              </span>
            </div>
          </div>
        )}
      </div>
    ));

    return () => {
      clearEditorPanelComponents();
    };
  });

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    const img = imageRef.current;
    const editCanvas = editCanvasRef.current;
    const container = containerRef.current;

    if (!canvas || !ctx || !container || layers.length === 0) return;

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    // Set canvas size to container size
    const containerRect = container.getBoundingClientRect();
    canvas.width = containerRect.width;
    canvas.height = containerRect.height;

    // Clear canvas with background color
    ctx.fillStyle =
      getComputedStyle(document.documentElement).getPropertyValue("--color-surface-tertiary") ||
      "#2a2a2a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate centered position with pan and zoom
    const scaledWidth = displayWidth * zoom;
    const scaledHeight = displayHeight * zoom;
    const offsetX = (canvas.width - scaledWidth) / 2 + pan.x;
    const offsetY = (canvas.height - scaledHeight) / 2 + pan.y;

    // Draw checkerboard pattern for transparency (like Photoshop)
    const checkerSize = 8;
    const lightColor = "#ffffff";
    const darkColor = "#cccccc";

    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, scaledWidth, scaledHeight);
    ctx.clip();

    const startX = Math.floor(offsetX / checkerSize) * checkerSize;
    const startY = Math.floor(offsetY / checkerSize) * checkerSize;
    const endX = offsetX + scaledWidth;
    const endY = offsetY + scaledHeight;

    for (let y = startY; y < endY; y += checkerSize) {
      for (let x = startX; x < endX; x += checkerSize) {
        const isLight =
          (Math.floor((x - startX) / checkerSize) + Math.floor((y - startY) / checkerSize)) % 2 ===
          0;
        ctx.fillStyle = isLight ? lightColor : darkColor;
        ctx.fillRect(x, y, checkerSize, checkerSize);
      }
    }
    ctx.restore();

    // Draw all layers sorted by zIndex (lower first = background)
    // Unified layer system renders both image and paint layers in correct order
    const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of sortedLayers) {
      if (!layer.visible) continue;

      ctx.save();
      ctx.globalAlpha = layer.opacity / 100;

      // All layers are paint layers now - render from canvas
      const layerCanvas = layerCanvasesRef.current.get(layer.id);
      if (layerCanvas) {
        ctx.imageSmoothingEnabled = false;
        ctx.translate(offsetX, offsetY);
        ctx.scale(zoom, zoom);
        ctx.drawImage(layerCanvas, 0, 0);
      }

      ctx.restore();
    }

    // Fallback: Draw legacy edit canvas if no layers but edit canvas exists
    if (layers.length === 0 && editCanvas) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(offsetX, offsetY);
      ctx.scale(zoom, zoom);
      ctx.drawImage(editCanvas, 0, 0);
      ctx.restore();
    }

    // Draw crop overlay
    if (cropArea && toolMode === "crop") {
      const cropX = offsetX + cropArea.x * zoom;
      const cropY = offsetY + cropArea.y * zoom;
      const cropW = cropArea.width * zoom;
      const cropH = cropArea.height * zoom;

      // Dark overlay outside crop area
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(offsetX, offsetY, scaledWidth, cropArea.y * zoom);
      ctx.fillRect(
        offsetX,
        cropY + cropH,
        scaledWidth,
        scaledHeight - (cropArea.y + cropArea.height) * zoom,
      );
      ctx.fillRect(offsetX, cropY, cropArea.x * zoom, cropH);
      ctx.fillRect(cropX + cropW, cropY, scaledWidth - (cropArea.x + cropArea.width) * zoom, cropH);

      // Draw crop border
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.strokeRect(cropX, cropY, cropW, cropH);

      // Draw grid lines (rule of thirds)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cropX + (cropW * i) / 3, cropY);
        ctx.lineTo(cropX + (cropW * i) / 3, cropY + cropH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cropX, cropY + (cropH * i) / 3);
        ctx.lineTo(cropX + cropW, cropY + (cropH * i) / 3);
        ctx.stroke();
      }

      // Draw resize handles
      const handleSize = 8;
      ctx.fillStyle = "#3b82f6";
      const handles = [
        { x: cropX, y: cropY },
        { x: cropX + cropW / 2, y: cropY },
        { x: cropX + cropW, y: cropY },
        { x: cropX + cropW, y: cropY + cropH / 2 },
        { x: cropX + cropW, y: cropY + cropH },
        { x: cropX + cropW / 2, y: cropY + cropH },
        { x: cropX, y: cropY + cropH },
        { x: cropX, y: cropY + cropH / 2 },
      ];

      handles.forEach((h) => {
        ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
      });
    }

    // Draw brush preview cursor
    if (mousePos && (toolMode === "brush" || toolMode === "eraser" || toolMode === "stamp")) {
      const screenX = offsetX + mousePos.x * zoom;
      const screenY = offsetY + mousePos.y * zoom;
      const brushRadius = (brushSize * zoom) / 2;

      ctx.save();
      ctx.strokeStyle = toolMode === "eraser" ? "#ff4444" : brushColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(screenX, screenY, brushRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw crosshair
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(screenX - 5, screenY);
      ctx.lineTo(screenX + 5, screenY);
      ctx.moveTo(screenX, screenY - 5);
      ctx.lineTo(screenX, screenY + 5);
      ctx.stroke();
      ctx.restore();
    }

    // Draw stamp source indicator
    if (stampSource && toolMode === "stamp") {
      const sourceX = offsetX + stampSource.x * zoom;
      const sourceY = offsetY + stampSource.y * zoom;

      ctx.save();
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sourceX - 10, sourceY);
      ctx.lineTo(sourceX + 10, sourceY);
      ctx.moveTo(sourceX, sourceY - 10);
      ctx.lineTo(sourceX, sourceY + 10);
      ctx.stroke();
      ctx.restore();
    }

    // Draw marquee selection (dotted line)
    // Show selection for tools that use it: marquee, move, fill, brush, eraser
    if (selection && (toolMode === "marquee" || toolMode === "move" || toolMode === "fill" || toolMode === "brush" || toolMode === "eraser" || floatingLayerRef.current)) {
      const selX = offsetX + selection.x * zoom;
      const selY = offsetY + selection.y * zoom;
      const selW = selection.width * zoom;
      const selH = selection.height * zoom;

      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(selX, selY, selW, selH);

      // Draw second layer with offset for "marching ants" effect
      ctx.strokeStyle = "#000000";
      ctx.lineDashOffset = 4;
      ctx.strokeRect(selX, selY, selW, selH);
      ctx.restore();
    }

    // Draw floating layer (when moving selection - both duplicate and cut-move)
    if (floatingLayerRef.current && isMovingSelection) {
      const floating = floatingLayerRef.current;
      const origW = floating.imageData.width * zoom;
      const origH = floating.imageData.height * zoom;

      // Draw original selection area indicator (where the copy/cut came from) - only for duplicate
      if (isDuplicating) {
        ctx.save();
        const origX = offsetX + floating.originX * zoom;
        const origY = offsetY + floating.originY * zoom;
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(origX, origY, origW, origH);
        ctx.restore();
      }

      // Draw the floating image being moved
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = floating.imageData.width;
      tempCanvas.height = floating.imageData.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.putImageData(floating.imageData, 0, 0);

        ctx.save();
        ctx.globalAlpha = isDuplicating ? 0.8 : 1.0;
        const floatX = offsetX + floating.x * zoom;
        const floatY = offsetY + floating.y * zoom;
        ctx.drawImage(tempCanvas, floatX, floatY, origW, origH);
        ctx.restore();

        // Draw selection border around floating layer
        ctx.save();
        ctx.strokeStyle = isDuplicating ? "#22c55e" : "#f59e0b";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(floatX, floatY, origW, origH);
        ctx.restore();
      }
    }

    // Draw eyedropper preview
    if (mousePos && toolMode === "eyedropper") {
      const screenX = offsetX + mousePos.x * zoom;
      const screenY = offsetY + mousePos.y * zoom;

      // Get color at position
      const pixel = ctx.getImageData(screenX, screenY, 1, 1).data;
      const previewColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;

      ctx.save();
      ctx.fillStyle = previewColor;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screenX, screenY - 30, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screenX, screenY - 30, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }, [
    layers,
    canvasSize,
    rotation,
    cropArea,
    zoom,
    pan,
    getDisplayDimensions,
    toolMode,
    mousePos,
    brushSize,
    brushColor,
    stampSource,
    selection,
    isDuplicating,
    isMovingSelection,
    activeLayerId,
  ]);

  // screenToImage and getMousePos are now provided by useCanvasInput hook
  // isInHandle, getActiveToolMode, useMouseHandlers moved above canvas rendering useEffect

  // Keyboard shortcuts - moved to useKeyboardShortcuts hook

  // Refs for wheel handler to access current values without stale closure
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Refs for wheel handler cleanup
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);
  const currentCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Canvas ref callback to attach wheel listener when canvas is mounted
  const canvasRefCallback = useCallback((canvas: HTMLCanvasElement | null) => {
    // Remove listener from previous canvas if exists
    if (currentCanvasRef.current && wheelHandlerRef.current) {
      currentCanvasRef.current.removeEventListener("wheel", wheelHandlerRef.current);
      wheelHandlerRef.current = null;
    }

    // Update the refs
    (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = canvas;
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

        // Adjust pan so the point under the mouse stays fixed
        setPan((p) => ({
          x: mouseX - (mouseX - p.x) * scale,
          y: mouseY - (mouseY - p.y) * scale,
        }));
        setZoom(newZoom);
      };

      wheelHandlerRef.current = wheelHandler;
      canvas.addEventListener("wheel", wheelHandler, { passive: false });
    }
  }, []);

  // Update crop area when aspect ratio changes - moved to useCropTool hook

  // Actions
  const rotate = (deg: number) => {
    setRotation((r) => (r + deg + 360) % 360);
    setCropArea(null);
    // Reinitialize edit canvas for new dimensions
    const { width, height } = getDisplayDimensions();
    initEditCanvas(rotation % 180 === 0 ? height : width, rotation % 180 === 0 ? width : height);
  };

  // Background removal handler
  const handleRemoveBackground = async () => {
    if (isRemovingBackground) return;

    // Get active layer
    const activeLayer = activeLayerId ? layers.find(l => l.id === activeLayerId) : null;
    if (!activeLayer) {
      alert("Please select a layer to remove background.");
      return;
    }

    // Get layer canvas
    const layerCanvas = layerCanvasesRef.current.get(activeLayer.id);
    if (!layerCanvas) {
      alert("Layer canvas not found.");
      return;
    }

    setIsRemovingBackground(true);
    setBgRemovalProgress(0);
    setBgRemovalStatus("Initializing...");

    try {
      // Save current state to history
      saveToHistory();

      let resultCanvas: HTMLCanvasElement;

      if (selection) {
        // Process only the selected area
        setBgRemovalStatus("Extracting selection...");

        // Create a canvas with the selection area
        const selectionCanvas = document.createElement("canvas");
        selectionCanvas.width = Math.round(selection.width);
        selectionCanvas.height = Math.round(selection.height);
        const selCtx = selectionCanvas.getContext("2d")!;

        // Draw the selection area from the layer canvas
        selCtx.drawImage(
          layerCanvas,
          Math.round(selection.x),
          Math.round(selection.y),
          Math.round(selection.width),
          Math.round(selection.height),
          0,
          0,
          Math.round(selection.width),
          Math.round(selection.height)
        );

        const sourceImage = selectionCanvas.toDataURL("image/png");

        // Remove background from selection
        resultCanvas = await removeBackground(sourceImage, (progress, status) => {
          setBgRemovalProgress(progress);
          setBgRemovalStatus(status);
        });

        // Composite the result back onto the layer canvas
        const ctx = layerCanvas.getContext("2d")!;
        // Clear the selection area
        ctx.clearRect(
          Math.round(selection.x),
          Math.round(selection.y),
          Math.round(selection.width),
          Math.round(selection.height)
        );
        // Draw the processed result
        ctx.drawImage(
          resultCanvas,
          Math.round(selection.x),
          Math.round(selection.y)
        );
      } else {
        // Process the entire layer canvas
        const sourceImage = layerCanvas.toDataURL("image/png");

        resultCanvas = await removeBackground(sourceImage, (progress, status) => {
          setBgRemovalProgress(progress);
          setBgRemovalStatus(status);
        });

        // Replace layer canvas content with result
        const ctx = layerCanvas.getContext("2d")!;
        ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        ctx.drawImage(resultCanvas, 0, 0);
      }

      setBgRemovalStatus("Done!");
    } catch (error) {
      console.error("Background removal failed:", error);
      setBgRemovalStatus("Failed");
      alert(t.backgroundRemovalFailed || "Background removal failed. Please try again.");
    } finally {
      setIsRemovingBackground(false);
      // Clear status after a delay
      setTimeout(() => {
        setBgRemovalProgress(0);
        setBgRemovalStatus("");
      }, 2000);
    }
  };

  // selectAllCrop and clearCrop - moved to useCropTool hook

  const clearEdits = () => {
    if (confirm(t.clearEditConfirm)) {
      const { width, height } = getDisplayDimensions();
      initEditCanvas(width, height);
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

  const exportImage = useCallback(() => {
    const img = imageRef.current;
    const editCanvas = editCanvasRef.current;
    if (!img) return;

    const exportCanvas = document.createElement("canvas");
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    // Create composite canvas (original + edits)
    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = displayWidth;
    compositeCanvas.height = displayHeight;
    const compositeCtx = compositeCanvas.getContext("2d");
    if (!compositeCtx) return;

    // Draw rotated original
    compositeCtx.translate(displayWidth / 2, displayHeight / 2);
    compositeCtx.rotate((rotation * Math.PI) / 180);
    compositeCtx.drawImage(img, -canvasSize.width / 2, -canvasSize.height / 2);
    compositeCtx.setTransform(1, 0, 0, 1, 0, 0);

    // Draw edits
    if (editCanvas) {
      compositeCtx.drawImage(editCanvas, 0, 0);
    }

    if (cropArea) {
      exportCanvas.width = cropArea.width;
      exportCanvas.height = cropArea.height;
      ctx.drawImage(
        compositeCanvas,
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
        0,
        0,
        cropArea.width,
        cropArea.height,
      );
    } else {
      exportCanvas.width = displayWidth;
      exportCanvas.height = displayHeight;
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
        link.download = `edited-image.${ext}`;
        link.click();
        URL.revokeObjectURL(url);
      },
      mimeType,
      quality,
    );
  }, [cropArea, rotation, canvasSize, outputFormat, quality, getDisplayDimensions]);

  // Get cursor based on tool mode
  const getCursor = () => {
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

  const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

  // Load saved projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const projects = await getAllImageProjects();
        setSavedProjects(projects);
        const info = await getStorageInfo();
        setStorageInfo(info);
      } catch (error) {
        console.error("Failed to load projects:", error);
      }
    };
    loadProjects();
  }, []);

  // ============================================
  // Auto-save/load functionality
  // ============================================
  const isInitializedRef = useRef(false);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          initEditCanvas(width, height, data.layers);
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

  // Auto-save on state change (debounced)
  useEffect(() => {
    if (!isInitializedRef.current) return;
    if (layers.length === 0) return;

    // Clear existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    // Debounced save
    autosaveTimeoutRef.current = setTimeout(() => {
      // Prepare layers with paint data
      const savedLayers: UnifiedLayer[] = layers.map((layer) => {
        if (layer.type === "paint") {
          const canvas = layerCanvasesRef.current.get(layer.id);
          return {
            ...layer,
            paintData: canvas ? canvas.toDataURL("image/png") : layer.paintData || "",
          };
        }
        return { ...layer };
      });

      saveEditorAutosaveData({
        canvasSize,
        rotation,
        zoom,
        pan,
        projectName,
        layers: savedLayers,
        activeLayerId,
        brushSize,
        brushColor,
        brushHardness,
      });
    }, EDITOR_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [
    layers,
    canvasSize,
    rotation,
    zoom,
    pan,
    projectName,
    activeLayerId,
    brushSize,
    brushColor,
    brushHardness,
  ]);

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

  // Save current project
  const handleSaveProject = useCallback(async () => {
    if (layers.length === 0) return;

    // Save all unified layer data
    const savedLayers: UnifiedLayer[] = layers.map((layer) => {
      if (layer.type === "paint") {
        const canvas = layerCanvasesRef.current.get(layer.id);
        return {
          ...layer,
          paintData: canvas ? canvas.toDataURL("image/png") : layer.paintData || "",
        };
      }
      return { ...layer };
    });

    // Legacy editLayerData for backward compatibility (first paint layer)
    const editCanvas = editCanvasRef.current;
    const editLayerData = editCanvas ? editCanvas.toDataURL("image/png") : "";

    const project: SavedImageProject = {
      id: currentProjectId || crypto.randomUUID(),
      name: projectName,
      editLayerData,
      unifiedLayers: savedLayers,
      activeLayerId: activeLayerId || undefined,
      canvasSize,
      rotation,
      savedAt: Date.now(),
    };

    try {
      await saveImageProject(project);
      setCurrentProjectId(project.id);

      // Refresh project list
      const projects = await getAllImageProjects();
      setSavedProjects(projects);
      const info = await getStorageInfo();
      setStorageInfo(info);

      alert(`${t.saved}!`);
    } catch (error) {
      console.error("Failed to save project:", error);
      alert(`${t.saveFailed}: ${(error as Error).message}`);
    }
  }, [projectName, canvasSize, rotation, currentProjectId, layers, activeLayerId]);

  // Cmd+S keyboard shortcut for save
  useEffect(() => {
    const handleSave = (e: KeyboardEvent) => {
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (layers.length > 0) {
          handleSaveProject();
        }
      }
    };

    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [layers.length, handleSaveProject]);

  // Load a saved project
  const handleLoadProject = useCallback(
    async (project: SavedImageProject) => {
      setProjectName(project.name);
      setCurrentProjectId(project.id);
      setRotation(project.rotation);
      // Support legacy imageSize field
      const size = project.canvasSize || project.imageSize || { width: 0, height: 0 };
      setCanvasSize(size);
      setCropArea(null);
      setSelection(null);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setStampSource(null);

      // Initialize edit canvas with layers
      const { width, height } =
        project.rotation % 180 === 0
          ? size
          : { width: size.height, height: size.width };

      // Check if project has new unified layer system
      if (project.unifiedLayers && project.unifiedLayers.length > 0) {
        initEditCanvas(width, height, project.unifiedLayers);
        if (project.activeLayerId) {
          setActiveLayerId(project.activeLayerId);
          const activeLayer = project.unifiedLayers.find(l => l.id === project.activeLayerId);
          if (activeLayer?.type === "paint") {
            editCanvasRef.current = layerCanvasesRef.current.get(project.activeLayerId) || null;
          }
        }
      } else if (project.layers && project.layers.length > 0) {
        // Legacy project with old ImageLayer format - convert to UnifiedLayer
        const convertedLayers: UnifiedLayer[] = project.layers.map((layer, index) => ({
          ...layer,
          type: "paint" as const,
          locked: false,
          zIndex: project.layers!.length - 1 - index,
          paintData: layer.data,
        }));
        initEditCanvas(width, height, convertedLayers);
        if (project.activeLayerId) {
          setActiveLayerId(project.activeLayerId);
          editCanvasRef.current = layerCanvasesRef.current.get(project.activeLayerId) || null;
        }
      } else {
        // Legacy project with single edit layer
        initEditCanvas(width, height);

        // Load edit layer data if exists
        if (project.editLayerData && editCanvasRef.current) {
          const editImg = new Image();
          editImg.onload = () => {
            const ctx = editCanvasRef.current?.getContext("2d");
            if (ctx) {
              ctx.drawImage(editImg, 0, 0);
            }
          };
          editImg.src = project.editLayerData;
        }
      }

      setIsProjectListOpen(false);
    },
    [initEditCanvas],
  );

  // Delete a project
  const handleDeleteProject = useCallback(
    async (id: string) => {
      if (!confirm(t.deleteConfirm)) return;

      try {
        await deleteImageProject(id);
        const projects = await getAllImageProjects();
        setSavedProjects(projects);
        const info = await getStorageInfo();
        setStorageInfo(info);

        if (currentProjectId === id) {
          setCurrentProjectId(null);
        }
      } catch (error) {
        console.error("Failed to delete project:", error);
        alert(`${t.deleteFailed}: ${(error as Error).message}`);
      }
    },
    [currentProjectId, t],
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
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden">
      {/* Top Toolbar - Row 1: File operations & Project name */}
      <div className="flex items-center gap-2 px-2 md:px-4 py-1.5 bg-surface-primary border-b border-border-default shrink-0">
        <h1 className="text-xs md:text-sm font-semibold hidden md:block">{t.imageEditor}</h1>
        <div className="h-4 w-px bg-border-default hidden md:block" />

        {/* New / Open / Save buttons */}
        <button
          onClick={handleNewCanvas}
          className="px-2 py-1 bg-surface-secondary hover:bg-surface-tertiary border border-border-default rounded text-xs transition-colors"
          title={t.newCanvas}
        >
          {t.new}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-2 py-1 bg-accent-primary hover:bg-accent-primary-hover text-white rounded text-xs transition-colors"
        >
          {t.open}
        </button>
        <button
          onClick={() => setIsProjectListOpen(true)}
          className="px-2 py-1 bg-surface-secondary hover:bg-surface-tertiary border border-border-default rounded text-xs transition-colors"
          title={t.savedProjects}
        >
          {t.load}
        </button>
        {layers.length > 0 && (
          <button
            onClick={handleSaveProject}
            className="px-2 py-1 bg-accent-success hover:bg-accent-success/80 text-white rounded text-xs transition-colors"
            title={`${t.save} (⌘S)`}
          >
            {t.save}
          </button>
        )}

        {layers.length > 0 && (
          <>
            <div className="h-4 w-px bg-border-default" />
            {/* Project name */}
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="px-2 py-0.5 bg-surface-secondary border border-border-default rounded text-xs w-20 md:w-24 focus:outline-none focus:border-accent-primary"
              placeholder={t.projectName}
            />
          </>
        )}

        <div className="flex-1" />

        {/* Image info - desktop only */}
        {layers.length > 0 && (
          <div className="text-xs text-text-tertiary hidden md:flex items-center gap-2">
            <span>
              {displayWidth} × {displayHeight}
            </span>
            {cropArea && (
              <span className="text-accent-primary">
                → {Math.round(cropArea.width)} × {Math.round(cropArea.height)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Top Toolbar - Row 2: Tools */}
      {layers.length > 0 && (
        <div className="flex items-center gap-1 px-2 md:px-4 py-1 bg-surface-primary border-b border-border-default shrink-0 overflow-x-auto">
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
                  onClick={() => setToolMode(tool.mode)}
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

          {/* Rotation */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => rotate(-90)}
              className="p-1 hover:bg-interactive-hover rounded transition-colors"
              title={t.rotateLeft}
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
            <button
              onClick={() => rotate(90)}
              className="p-1 hover:bg-interactive-hover rounded transition-colors"
              title={t.rotateRight}
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
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
              className="px-1 py-0.5 bg-surface-secondary border border-border-default rounded text-xs focus:outline-none focus:border-accent-primary"
            >
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
              <option value="jpeg">JPEG</option>
            </select>
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

          <div className="flex-1" />

          <button
            onClick={clearEdits}
            className="px-2 py-1 bg-accent-warning hover:bg-accent-warning/80 text-white rounded text-xs transition-colors"
            title={t.resetEdit}
          >
            {t.reset}
          </button>

          <button
            onClick={exportImage}
            className="px-2 py-1 bg-accent-success hover:bg-accent-success/80 text-white rounded text-xs transition-colors"
          >
            Export
          </button>
        </div>
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
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          cropArea={cropArea}
          selectAll={selectAllCrop}
          clearCrop={clearCrop}
          currentToolName={toolButtons.find(tb => tb.mode === toolMode)?.name}
          translations={{
            size: t.size,
            hardness: t.hardness,
            color: t.color,
            source: t.source,
            altClickToSetSource: t.altClickToSetSource,
          }}
        />
      )}

      {/* Main Content Area with Docking System */}
      <EditorLayoutProvider>
        <div className="h-full w-full flex overflow-hidden relative">
          <EditorDockableArea />
        </div>
      </EditorLayoutProvider>

      {/* Background Removal Confirmation Popup */}
      {showBgRemovalConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-primary rounded-lg p-6 shadow-xl max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="7" r="3" strokeWidth={2} />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10c-4 0-6 2.5-6 5v2h12v-2c0-2.5-2-5-6-5z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary">{t.removeBackground}</h3>
            </div>
            <p className="text-text-secondary text-sm mb-2">
              AI 모델을 사용해 선택된 레이어의 배경을 자동으로 제거합니다.
            </p>
            <p className="text-text-tertiary text-xs mb-4">
              {selection ? "선택 영역의 배경만 제거됩니다." : "전체 레이어의 배경이 제거됩니다."}
            </p>
            <p className="text-text-tertiary text-xs mb-4">
              첫 실행 시 AI 모델을 다운로드합니다 (~30MB)
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowBgRemovalConfirm(false)}
                className="px-4 py-2 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => {
                  setShowBgRemovalConfirm(false);
                  handleRemoveBackground();
                }}
                className="px-4 py-2 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors"
              >
                {t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Removal Loading Overlay */}
      {isRemovingBackground && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-primary rounded-lg p-6 shadow-xl flex flex-col items-center gap-4 min-w-[280px]">
            <div className="relative">
              <svg className="w-12 h-12 animate-spin text-accent-primary" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-text-primary font-medium">{t.removeBackground}</p>
              <p className="text-text-secondary text-sm mt-1">{bgRemovalStatus}</p>
              <div className="mt-3 w-full bg-surface-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent-primary h-full transition-all duration-300 ease-out"
                  style={{ width: `${bgRemovalProgress}%` }}
                />
              </div>
              <p className="text-text-tertiary text-xs mt-2">{Math.round(bgRemovalProgress)}%</p>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
