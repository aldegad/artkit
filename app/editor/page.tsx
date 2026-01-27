"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useLanguage } from "../../shared/contexts";
import { Tooltip, ImageDropZone } from "../../shared/components";
import {
  EditorToolMode,
  AspectRatio,
  OutputFormat,
  CropArea,
  SavedImageProject,
  UnifiedLayer,
  Point,
  ASPECT_RATIOS,
  ASPECT_RATIO_VALUES,
  createImageLayer,
  createPaintLayer,
  ProjectListModal,
  loadEditorAutosaveData,
  saveEditorAutosaveData,
  clearEditorAutosaveData,
  EDITOR_AUTOSAVE_DEBOUNCE_MS,
} from "../../domains/editor";
import {
  saveImageProject,
  getAllImageProjects,
  deleteImageProject,
  getStorageInfo,
} from "../../utils/storage";
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
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [rotation, setRotation] = useState(0);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("free");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("png");
  const [quality, setQuality] = useState(0.9);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragType, setDragType] = useState<"create" | "move" | "resize" | "pan" | "draw" | null>(
    null,
  );
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

  // Tool & View state
  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Brush/Eraser state
  const [brushSize, setBrushSize] = useState(10);
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushHardness, setBrushHardness] = useState(100); // 0-100, 100 = hard edge

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

  // Clone stamp state
  const [stampSource, setStampSource] = useState<Point | null>(null);

  // Mouse position for brush preview
  const [mousePos, setMousePos] = useState<Point | null>(null);

  // Marquee selection state
  const [selection, setSelection] = useState<CropArea | null>(null);
  const [isMovingSelection, setIsMovingSelection] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const clipboardRef = useRef<ImageData | null>(null);
  const floatingLayerRef = useRef<{
    imageData: ImageData;
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);
  const dragStartOriginRef = useRef<Point | null>(null); // 드래그 시작 시 원본 위치 (Shift 제한용)

  // Unified Layer system (combines image and paint layers)
  const [layers, setLayers] = useState<UnifiedLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  // Canvas storage for paint layers
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  // Image storage for image layers
  const [layerImages, setLayerImages] = useState<Map<string, HTMLImageElement>>(new Map());
  // Drag state for image layers
  const [isDraggingLayer, setIsDraggingLayer] = useState(false);
  const [layerDragStart, setLayerDragStart] = useState<Point>({ x: 0, y: 0 });
  // Drag state for layer panel reordering
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit canvas stores all paint operations
  const editCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastDrawPoint = useRef<Point | null>(null);

  // Undo/Redo history
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const MAX_HISTORY = 50;

  // Use imported ASPECT_RATIOS and ASPECT_RATIO_VALUES from domain
  const getAspectRatioValue = (ratio: AspectRatio): number | null => {
    return ASPECT_RATIO_VALUES[ratio];
  };

  // Get display dimensions (considering rotation)
  const getDisplayDimensions = useCallback(() => {
    const width = rotation % 180 === 0 ? imageSize.width : imageSize.height;
    const height = rotation % 180 === 0 ? imageSize.height : imageSize.width;
    return { width, height };
  }, [rotation, imageSize]);

  // Initialize edit canvas and layers when image loads
  const initEditCanvas = useCallback(
    (width: number, height: number, existingLayers?: UnifiedLayer[]) => {
      // Clear layer canvases
      layerCanvasesRef.current.clear();

      if (existingLayers && existingLayers.length > 0) {
        // Load existing layers
        setLayers(existingLayers);
        // Find first paint layer to set as active, or first layer
        const firstPaintLayer = existingLayers.find(l => l.type === "paint");
        setActiveLayerId(firstPaintLayer?.id || existingLayers[0].id);

        // Create canvases/load images for each layer
        existingLayers.forEach((layer) => {
          if (layer.type === "paint") {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            layerCanvasesRef.current.set(layer.id, canvas);

            // Load paint data if exists
            if (layer.paintData) {
              const img = new Image();
              img.onload = () => {
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.drawImage(img, 0, 0);
              };
              img.src = layer.paintData;
            }
          } else if (layer.type === "image" && layer.imageSrc) {
            // Load image layer
            const img = new Image();
            img.onload = () => {
              setLayerImages(prev => {
                const newMap = new Map(prev);
                newMap.set(layer.id, img);
                return newMap;
              });
            };
            img.src = layer.imageSrc;
          }
        });

        // Set first paint layer as edit canvas for backward compatibility
        if (firstPaintLayer) {
          editCanvasRef.current = layerCanvasesRef.current.get(firstPaintLayer.id) || null;
        }
      } else {
        // Create default paint layer
        const defaultLayer = createPaintLayer(`${t.layer} 1`, 0);
        setLayers([defaultLayer]);
        setActiveLayerId(defaultLayer.id);

        const editCanvas = document.createElement("canvas");
        editCanvas.width = width;
        editCanvas.height = height;
        const ctx = editCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, width, height);
        }
        editCanvasRef.current = editCanvas;
        layerCanvasesRef.current.set(defaultLayer.id, editCanvas);
      }

      // Reset history
      historyRef.current = [];
      historyIndexRef.current = -1;
    },
    [t.layer],
  );

  // Save current edit canvas state to history
  const saveToHistory = useCallback(() => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    // Remove any future states if we're not at the end
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }

    // Save current state
    const imageData = ctx.getImageData(0, 0, editCanvas.width, editCanvas.height);
    historyRef.current.push(imageData);

    // Limit history size
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    } else {
      historyIndexRef.current++;
    }
  }, []);

  // Undo last edit
  const undo = useCallback(() => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const imageData = historyRef.current[historyIndexRef.current];
      ctx.putImageData(imageData, 0, 0);
    } else if (historyIndexRef.current === 0) {
      // Undo to initial blank state
      historyIndexRef.current = -1;
      ctx.clearRect(0, 0, editCanvas.width, editCanvas.height);
    }
  }, []);

  // Redo last undone edit
  const redo = useCallback(() => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const imageData = historyRef.current[historyIndexRef.current];
      ctx.putImageData(imageData, 0, 0);
    }
  }, []);

  // ============================================
  // Unified Layer Management Functions
  // ============================================

  // Add new paint layer
  const addPaintLayer = useCallback(() => {
    const { width, height } = getDisplayDimensions();
    if (width === 0 || height === 0) return;

    const maxZIndex = layers.length > 0 ? Math.max(...layers.map(l => l.zIndex)) + 1 : 0;
    const newLayer = createPaintLayer(`${t.layer} ${layers.length + 1}`, maxZIndex);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    layerCanvasesRef.current.set(newLayer.id, canvas);

    setLayers((prev) => [newLayer, ...prev]); // Add on top (visually)
    setActiveLayerId(newLayer.id);
    editCanvasRef.current = canvas;
  }, [layers, getDisplayDimensions, t.layer]);

  // Add new image layer
  const addImageLayer = useCallback((imageSrc: string, name?: string) => {
    const img = new Image();
    img.onload = () => {
      const maxZIndex = layers.length > 0 ? Math.max(...layers.map(l => l.zIndex)) + 1 : 0;
      const newLayer = createImageLayer(
        imageSrc,
        name || `Image ${layers.filter(l => l.type === "image").length + 1}`,
        { width: img.width, height: img.height },
        maxZIndex
      );

      setLayers((prev) => [newLayer, ...prev]);
      setActiveLayerId(newLayer.id);
      setLayerImages((prev) => {
        const newMap = new Map(prev);
        newMap.set(newLayer.id, img);
        return newMap;
      });
    };
    img.src = imageSrc;
  }, [layers]);

  // Delete layer
  const deleteLayer = useCallback(
    (layerId: string) => {
      if (layers.length <= 1) {
        alert(t.minOneLayerRequired);
        return;
      }

      const layer = layers.find(l => l.id === layerId);

      setLayers((prev) => {
        const newLayers = prev.filter((l) => l.id !== layerId);
        // If deleted active layer, switch to first available
        if (activeLayerId === layerId && newLayers.length > 0) {
          const nextLayer = newLayers[0];
          setActiveLayerId(nextLayer.id);
          if (nextLayer.type === "paint") {
            editCanvasRef.current = layerCanvasesRef.current.get(nextLayer.id) || null;
          }
        }
        return newLayers;
      });

      // Clean up resources
      if (layer?.type === "paint") {
        layerCanvasesRef.current.delete(layerId);
      } else {
        setLayerImages(prev => {
          const newMap = new Map(prev);
          newMap.delete(layerId);
          return newMap;
        });
      }
    },
    [layers, activeLayerId, t.minOneLayerRequired],
  );

  // Select layer
  const selectLayer = useCallback((layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    setActiveLayerId(layerId);
    if (layer?.type === "paint") {
      editCanvasRef.current = layerCanvasesRef.current.get(layerId) || null;
    }
  }, [layers]);

  // Toggle layer visibility
  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)));
  }, []);

  // Update layer
  const updateLayer = useCallback((layerId: string, updates: Partial<UnifiedLayer>) => {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, ...updates } : l)));
  }, []);

  // Update layer opacity
  const updateLayerOpacity = useCallback((layerId: string, opacity: number) => {
    updateLayer(layerId, { opacity });
  }, [updateLayer]);

  // Rename layer
  const renameLayer = useCallback((layerId: string, name: string) => {
    updateLayer(layerId, { name });
  }, [updateLayer]);

  // Toggle layer lock
  const toggleLayerLock = useCallback((layerId: string) => {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, locked: !l.locked } : l)));
  }, []);

  // Move layer up/down
  const moveLayer = useCallback((layerId: string, direction: "up" | "down") => {
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === layerId);
      if (idx === -1) return prev;
      if (direction === "up" && idx === 0) return prev;
      if (direction === "down" && idx === prev.length - 1) return prev;

      const newLayers = [...prev];
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      [newLayers[idx], newLayers[targetIdx]] = [newLayers[targetIdx], newLayers[idx]];
      // Update zIndex to match position
      return newLayers.map((l, i) => ({ ...l, zIndex: newLayers.length - 1 - i }));
    });
  }, []);

  // Reorder layers via drag and drop
  const reorderLayers = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;

    setLayers((prev) => {
      const sortedLayers = [...prev].sort((a, b) => b.zIndex - a.zIndex);
      const fromIndex = sortedLayers.findIndex((l) => l.id === fromId);
      const toIndex = sortedLayers.findIndex((l) => l.id === toId);

      if (fromIndex === -1 || toIndex === -1) return prev;

      const newSorted = [...sortedLayers];
      const [removed] = newSorted.splice(fromIndex, 1);
      newSorted.splice(toIndex, 0, removed);

      // Update zIndex based on new order (higher index in sorted = higher zIndex)
      return newSorted.map((l, i) => ({ ...l, zIndex: newSorted.length - 1 - i }));
    });
  }, []);

  // Merge paint layer down (only for paint layers)
  const mergeLayerDown = useCallback(
    (layerId: string) => {
      const idx = layers.findIndex((l) => l.id === layerId);
      if (idx === -1 || idx === layers.length - 1) return;

      const upperLayer = layers[idx];
      const lowerLayer = layers[idx + 1];

      // Can only merge paint layers
      if (upperLayer.type !== "paint" || lowerLayer.type !== "paint") return;

      const upperCanvas = layerCanvasesRef.current.get(layerId);
      const lowerCanvas = layerCanvasesRef.current.get(lowerLayer.id);

      if (!upperCanvas || !lowerCanvas) return;

      saveToHistory();

      // Merge upper into lower
      const ctx = lowerCanvas.getContext("2d");
      if (ctx) {
        ctx.globalAlpha = upperLayer.opacity / 100;
        ctx.drawImage(upperCanvas, 0, 0);
        ctx.globalAlpha = 1;
      }

      // Remove upper layer
      deleteLayer(layerId);
    },
    [layers, saveToHistory, deleteLayer],
  );

  // Duplicate layer
  const duplicateLayer = useCallback((layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;

    const maxZIndex = Math.max(...layers.map(l => l.zIndex)) + 1;
    const newLayer: UnifiedLayer = {
      ...layer,
      id: crypto.randomUUID(),
      name: `${layer.name} (copy)`,
      zIndex: maxZIndex,
    };

    if (layer.type === "image") {
      // Offset the copy slightly
      newLayer.position = {
        x: (layer.position?.x || 0) + 20,
        y: (layer.position?.y || 0) + 20,
      };
      // Copy image reference
      const existingImg = layerImages.get(layerId);
      if (existingImg) {
        setLayerImages(prev => {
          const newMap = new Map(prev);
          newMap.set(newLayer.id, existingImg);
          return newMap;
        });
      }
    } else if (layer.type === "paint") {
      // Copy canvas data
      const { width, height } = getDisplayDimensions();
      const newCanvas = document.createElement("canvas");
      newCanvas.width = width;
      newCanvas.height = height;
      const srcCanvas = layerCanvasesRef.current.get(layerId);
      if (srcCanvas) {
        const ctx = newCanvas.getContext("2d");
        if (ctx) ctx.drawImage(srcCanvas, 0, 0);
      }
      layerCanvasesRef.current.set(newLayer.id, newCanvas);
    }

    setLayers(prev => [newLayer, ...prev]);
    setActiveLayerId(newLayer.id);
  }, [layers, layerImages, getDisplayDimensions]);

  // Legacy alias for backward compatibility
  const addLayer = addPaintLayer;

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

  // Load image from file
  const loadImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension

        // If no main image exists, set this as the main image first
        if (!imageSrc) {
          setImageSrc(src);
          setRotation(0);
          setCropArea(null);
          setZoom(1);
          setPan({ x: 0, y: 0 });
          setStampSource(null);

          const img = new Image();
          img.onload = () => {
            imageRef.current = img;
            setImageSize({ width: img.width, height: img.height });

            // Create image layer and default paint layer together
            const imageLayer = createImageLayer(
              src,
              fileName,
              { width: img.width, height: img.height },
              1 // Higher zIndex for image layer
            );
            const paintLayer = createPaintLayer(`${t.layer} 1`, 0);

            // Create paint canvas
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            layerCanvasesRef.current.set(paintLayer.id, canvas);
            editCanvasRef.current = canvas;

            // Set layers and active layer
            setLayers([imageLayer, paintLayer]);
            setActiveLayerId(paintLayer.id);

            // Load image for the image layer
            setLayerImages((prev) => {
              const newMap = new Map(prev);
              newMap.set(imageLayer.id, img);
              return newMap;
            });
          };
          img.src = src;
        } else {
          // Add as image layer to existing project
          addImageLayer(src, fileName);
        }
      };
      reader.readAsDataURL(file);
    },
    [addImageLayer, imageSrc, t.layer],
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

  // Draw on edit canvas
  const drawOnEditCanvas = useCallback(
    (x: number, y: number, isStart: boolean = false) => {
      const editCanvas = editCanvasRef.current;
      const ctx = editCanvas?.getContext("2d");
      const img = imageRef.current;
      if (!editCanvas || !ctx || !img) return;

      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

      // Clamp to image bounds
      x = Math.max(0, Math.min(x, displayWidth));
      y = Math.max(0, Math.min(y, displayHeight));

      // Helper function to draw a soft brush dab
      const drawSoftDab = (cx: number, cy: number, isEraser: boolean = false) => {
        const radius = brushSize / 2;
        const hardnessRatio = brushHardness / 100;

        if (hardnessRatio >= 0.99) {
          // Hard brush - simple fill
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          if (isEraser) {
            ctx.fill();
          } else {
            ctx.fillStyle = brushColor;
            ctx.fill();
          }
        } else {
          // Soft brush - use radial gradient
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);

          // Parse brush color to RGB
          const hex = brushColor.replace("#", "");
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);

          // Hardness determines where the falloff starts
          // hardness 0 = falloff from center, hardness 100 = no falloff
          const innerStop = hardnessRatio * 0.9; // Start of falloff

          if (isEraser) {
            gradient.addColorStop(0, "rgba(0,0,0,1)");
            gradient.addColorStop(Math.max(0.01, innerStop), "rgba(0,0,0,1)");
            gradient.addColorStop(1, "rgba(0,0,0,0)");
          } else {
            gradient.addColorStop(0, `rgba(${r},${g},${b},1)`);
            gradient.addColorStop(Math.max(0.01, innerStop), `rgba(${r},${g},${b},1)`);
            gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
          }

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      // Helper function to interpolate dabs along a line for smooth strokes
      const drawSoftLine = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        isEraser: boolean = false,
      ) => {
        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const spacing = Math.max(1, brushSize * 0.15); // Dab spacing based on brush size
        const steps = Math.ceil(dist / spacing);

        for (let i = 0; i <= steps; i++) {
          const t = steps === 0 ? 0 : i / steps;
          const cx = x1 + (x2 - x1) * t;
          const cy = y1 + (y2 - y1) * t;
          drawSoftDab(cx, cy, isEraser);
        }
      };

      if (toolMode === "brush") {
        ctx.globalCompositeOperation = "source-over";

        if (isStart || !lastDrawPoint.current) {
          drawSoftDab(x, y, false);
        } else {
          drawSoftLine(lastDrawPoint.current.x, lastDrawPoint.current.y, x, y, false);
        }
      } else if (toolMode === "eraser") {
        ctx.globalCompositeOperation = "destination-out";

        if (isStart || !lastDrawPoint.current) {
          drawSoftDab(x, y, true);
        } else {
          drawSoftLine(lastDrawPoint.current.x, lastDrawPoint.current.y, x, y, true);
        }
        ctx.globalCompositeOperation = "source-over";
      } else if (toolMode === "stamp" && stampSource) {
        // Clone stamp - copy from source to destination
        const offsetX = x - stampSource.x;
        const offsetY = y - stampSource.y;

        // Create a temporary canvas to get the original image data at source
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = displayWidth;
        tempCanvas.height = displayHeight;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;

        // Draw rotated original image
        tempCtx.translate(displayWidth / 2, displayHeight / 2);
        tempCtx.rotate((rotation * Math.PI) / 180);
        tempCtx.drawImage(img, -imageSize.width / 2, -imageSize.height / 2);

        // Get source pixel data
        const sourceX = x - offsetX;
        const sourceY = y - offsetY;
        const halfBrush = brushSize / 2;

        // Draw circular stamp
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, halfBrush, 0, Math.PI * 2);
        ctx.clip();

        // Draw from temp canvas (original) to edit canvas
        ctx.drawImage(
          tempCanvas,
          sourceX - halfBrush,
          sourceY - halfBrush,
          brushSize,
          brushSize,
          x - halfBrush,
          y - halfBrush,
          brushSize,
          brushSize,
        );
        ctx.restore();
      }

      lastDrawPoint.current = { x, y };
    },
    [
      toolMode,
      brushSize,
      brushColor,
      brushHardness,
      stampSource,
      rotation,
      imageSize,
      getDisplayDimensions,
    ],
  );

  // Pick color from canvas
  const pickColor = useCallback(
    (x: number, y: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
      const scaledWidth = displayWidth * zoom;
      const scaledHeight = displayHeight * zoom;
      const offsetX = (canvas.width - scaledWidth) / 2 + pan.x;
      const offsetY = (canvas.height - scaledHeight) / 2 + pan.y;

      // Convert to screen position
      const screenX = offsetX + x * zoom;
      const screenY = offsetY + y * zoom;

      const pixel = ctx.getImageData(screenX, screenY, 1, 1).data;
      const hex =
        "#" + [pixel[0], pixel[1], pixel[2]].map((c) => c.toString(16).padStart(2, "0")).join("");
      setBrushColor(hex);
    },
    [zoom, pan, getDisplayDimensions],
  );

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
        {!imageSrc ? (
          <ImageDropZone
            variant="editor"
            onFileSelect={(files) => files[0] && loadImageFile(files[0])}
          />
        ) : (
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
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

                  {/* Layer thumbnail/type indicator */}
                  <div className="w-10 h-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PHJlY3Qgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iI2NjYyIvPjxyZWN0IHg9IjgiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNjY2MiLz48L3N2Zz4=')] border border-border-default rounded overflow-hidden shrink-0 flex items-center justify-center">
                    {layer.type === "image" && layer.imageSrc ? (
                      <img
                        src={layer.imageSrc}
                        alt={layer.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <svg className="w-5 h-5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    )}
                  </div>

                  {/* Layer name and type */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={layer.name}
                      onChange={(e) => renameLayer(layer.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-xs bg-transparent border-none focus:outline-none focus:bg-surface-secondary px-1 rounded truncate"
                    />
                    <span className="text-[10px] text-text-quaternary px-1">
                      {layer.type === "image" ? "Image" : "Paint"}
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
    const ctx = canvas?.getContext("2d");
    const img = imageRef.current;
    const editCanvas = editCanvasRef.current;
    const container = containerRef.current;

    if (!canvas || !ctx || !img || !imageSrc || !container) return;

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

      if (layer.type === "image") {
        // Render image layer
        const layerImg = layerImages.get(layer.id);
        if (!layerImg || !layer.originalSize) {
          ctx.restore();
          continue;
        }

        const layerScale = layer.scale || 1;
        const layerRotation = layer.rotation || 0;
        const layerWidth = layer.originalSize.width * layerScale * zoom;
        const layerHeight = layer.originalSize.height * layerScale * zoom;
        const layerX = offsetX + (layer.position?.x || 0) * zoom;
        const layerY = offsetY + (layer.position?.y || 0) * zoom;

        // Apply per-layer rotation if needed
        if (layerRotation !== 0) {
          const centerX = layerX + layerWidth / 2;
          const centerY = layerY + layerHeight / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate((layerRotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }

        ctx.drawImage(layerImg, layerX, layerY, layerWidth, layerHeight);

        // Draw selection border for active layer
        if (layer.id === activeLayerId) {
          ctx.strokeStyle = "#00aaff";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(layerX, layerY, layerWidth, layerHeight);
          ctx.setLineDash([]);
        }
      } else if (layer.type === "paint") {
        // Render paint layer
        const layerCanvas = layerCanvasesRef.current.get(layer.id);
        if (layerCanvas) {
          ctx.imageSmoothingEnabled = false;
          ctx.translate(offsetX, offsetY);
          ctx.scale(zoom, zoom);
          ctx.drawImage(layerCanvas, 0, 0);
        }
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
    if (selection && (toolMode === "marquee" || floatingLayerRef.current)) {
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

    // Draw floating layer (when duplicating and moving)
    if (floatingLayerRef.current && isDuplicating && isMovingSelection) {
      const floating = floatingLayerRef.current;

      // Draw original selection area indicator (where the copy came from)
      ctx.save();
      const origX = offsetX + floating.originX * zoom;
      const origY = offsetY + floating.originY * zoom;
      const origW = floating.imageData.width * zoom;
      const origH = floating.imageData.height * zoom;

      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(origX, origY, origW, origH);
      ctx.restore();

      // Draw the floating image being moved
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = floating.imageData.width;
      tempCanvas.height = floating.imageData.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.putImageData(floating.imageData, 0, 0);

        ctx.save();
        ctx.globalAlpha = 0.8;
        const floatX = offsetX + floating.x * zoom;
        const floatY = offsetY + floating.y * zoom;
        ctx.drawImage(tempCanvas, floatX, floatY, origW, origH);
        ctx.restore();

        // Draw selection border around floating layer
        ctx.save();
        ctx.strokeStyle = "#22c55e";
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
    imageSrc,
    imageSize,
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
    layers,
    layerImages,
    activeLayerId,
  ]);

  // Convert screen coords to image coords
  const screenToImage = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
      const scaledWidth = displayWidth * zoom;
      const scaledHeight = displayHeight * zoom;
      const offsetX = (canvas.width - scaledWidth) / 2 + pan.x;
      const offsetY = (canvas.height - scaledHeight) / 2 + pan.y;

      return {
        x: (screenX - offsetX) / zoom,
        y: (screenY - offsetY) / zoom,
      };
    },
    [zoom, pan, getDisplayDimensions],
  );

  // Mouse position relative to canvas
  const getMousePos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const isInHandle = (imagePos: { x: number; y: number }, handlePos: { x: number; y: number }) => {
    const handleSize = 12 / zoom;
    return (
      Math.abs(imagePos.x - handlePos.x) < handleSize &&
      Math.abs(imagePos.y - handlePos.y) < handleSize
    );
  };

  // Check if in active tool mode (considering space key for temporary hand tool)
  const getActiveToolMode = useCallback(() => {
    if (isSpacePressed) return "hand";
    return toolMode;
  }, [isSpacePressed, toolMode]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageSrc) return;

    const screenPos = getMousePos(e);
    const imagePos = screenToImage(screenPos.x, screenPos.y);
    const activeMode = getActiveToolMode();
    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    // Check if within image bounds for drawing tools
    const inBounds =
      imagePos.x >= 0 &&
      imagePos.x <= displayWidth &&
      imagePos.y >= 0 &&
      imagePos.y <= displayHeight;

    if (activeMode === "hand") {
      setDragType("pan");
      setDragStart(screenPos);
      setIsDragging(true);
      return;
    }

    // Check for image layer dragging
    if (activeLayerId) {
      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (activeLayer && activeLayer.type === "image" && activeLayer.visible && !activeLayer.locked && activeLayer.originalSize) {
        // Calculate layer bounds in screen space
        const layerScale = activeLayer.scale || 1;
        const layerWidth = activeLayer.originalSize.width * layerScale * zoom;
        const layerHeight = activeLayer.originalSize.height * layerScale * zoom;
        const canvas = canvasRef.current;
        if (canvas) {
          const scaledWidth = displayWidth * zoom;
          const scaledHeight = displayHeight * zoom;
          const offsetX = (canvas.width - scaledWidth) / 2 + pan.x;
          const offsetY = (canvas.height - scaledHeight) / 2 + pan.y;
          const layerX = offsetX + (activeLayer.position?.x || 0) * zoom;
          const layerY = offsetY + (activeLayer.position?.y || 0) * zoom;

          // Check if click is within active image layer
          if (
            screenPos.x >= layerX &&
            screenPos.x <= layerX + layerWidth &&
            screenPos.y >= layerY &&
            screenPos.y <= layerY + layerHeight
          ) {
            setIsDraggingLayer(true);
            setLayerDragStart({ x: screenPos.x, y: screenPos.y });
            return;
          }
        }
      }
    }

    if (activeMode === "zoom") {
      const zoomFactor = e.altKey ? 0.8 : 1.25;
      const newZoom = Math.max(0.1, Math.min(10, zoom * zoomFactor));

      const dx = screenPos.x - canvasRef.current!.width / 2;
      const dy = screenPos.y - canvasRef.current!.height / 2;
      const scale = newZoom / zoom;

      setPan((p) => ({
        x: p.x * scale - dx * (scale - 1),
        y: p.y * scale - dy * (scale - 1),
      }));
      setZoom(newZoom);
      return;
    }

    if (activeMode === "eyedropper" && inBounds) {
      pickColor(imagePos.x, imagePos.y);
      return;
    }

    if (activeMode === "stamp") {
      if (e.altKey && inBounds) {
        // Alt+click to set stamp source
        setStampSource({ x: imagePos.x, y: imagePos.y });
        return;
      }

      if (!stampSource) {
        alert("Alt+클릭으로 복제 소스를 먼저 지정하세요");
        return;
      }

      if (inBounds) {
        saveToHistory(); // Save state before drawing
        setDragType("draw");
        lastDrawPoint.current = null;
        drawOnEditCanvas(imagePos.x, imagePos.y, true);
        setIsDragging(true);
      }
      return;
    }

    if ((activeMode === "brush" || activeMode === "eraser") && inBounds) {
      saveToHistory(); // Save state before drawing
      setDragType("draw");
      lastDrawPoint.current = null;
      drawOnEditCanvas(imagePos.x, imagePos.y, true);
      setIsDragging(true);
      return;
    }

    // Fill tool - fill selection or clicked area
    if (activeMode === "fill" && inBounds) {
      fillWithColor();
      return;
    }

    // Marquee tool mode
    if (activeMode === "marquee") {
      if (selection) {
        // Check if clicking inside selection
        if (
          imagePos.x >= selection.x &&
          imagePos.x <= selection.x + selection.width &&
          imagePos.y >= selection.y &&
          imagePos.y <= selection.y + selection.height
        ) {
          // Alt+click to duplicate and move
          if (e.altKey) {
            const editCanvas = editCanvasRef.current;
            const ctx = editCanvas?.getContext("2d");
            const img = imageRef.current;
            if (!editCanvas || !ctx || !img) return;

            const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

            // Create composite canvas to get the selected area
            const compositeCanvas = document.createElement("canvas");
            compositeCanvas.width = displayWidth;
            compositeCanvas.height = displayHeight;
            const compositeCtx = compositeCanvas.getContext("2d");
            if (!compositeCtx) return;

            compositeCtx.translate(displayWidth / 2, displayHeight / 2);
            compositeCtx.rotate((rotation * Math.PI) / 180);
            compositeCtx.drawImage(img, -imageSize.width / 2, -imageSize.height / 2);
            compositeCtx.setTransform(1, 0, 0, 1, 0, 0);
            compositeCtx.drawImage(editCanvas, 0, 0);

            // Copy selection to floating layer (keep original position for display)
            const imageData = compositeCtx.getImageData(
              Math.round(selection.x),
              Math.round(selection.y),
              Math.round(selection.width),
              Math.round(selection.height),
            );
            floatingLayerRef.current = {
              imageData,
              x: selection.x,
              y: selection.y,
              originX: selection.x,
              originY: selection.y,
            };

            saveToHistory();
            setIsMovingSelection(true);
            setIsDuplicating(true);
            setDragType("move");
            setDragStart(imagePos);
            dragStartOriginRef.current = { x: imagePos.x, y: imagePos.y };
            setIsDragging(true);
            return;
          }

          // Regular click inside selection - move existing floating layer
          if (floatingLayerRef.current) {
            setDragType("move");
            setDragStart(imagePos);
            dragStartOriginRef.current = { x: imagePos.x, y: imagePos.y };
            setIsDragging(true);
            setIsMovingSelection(true);
            setIsDuplicating(false);
            return;
          }
        }
      }

      // Click outside selection or no selection - create new selection
      if (inBounds) {
        setSelection(null);
        floatingLayerRef.current = null;
        setIsDuplicating(false);
        setDragType("create");
        setDragStart({ x: Math.round(imagePos.x), y: Math.round(imagePos.y) });
        setSelection({ x: Math.round(imagePos.x), y: Math.round(imagePos.y), width: 0, height: 0 });
        setIsDragging(true);
      }
      return;
    }

    // Crop tool mode
    if (activeMode === "crop") {
      if (cropArea) {
        const handles = [
          { x: cropArea.x, y: cropArea.y, name: "nw" },
          { x: cropArea.x + cropArea.width / 2, y: cropArea.y, name: "n" },
          { x: cropArea.x + cropArea.width, y: cropArea.y, name: "ne" },
          { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height / 2, name: "e" },
          { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height, name: "se" },
          { x: cropArea.x + cropArea.width / 2, y: cropArea.y + cropArea.height, name: "s" },
          { x: cropArea.x, y: cropArea.y + cropArea.height, name: "sw" },
          { x: cropArea.x, y: cropArea.y + cropArea.height / 2, name: "w" },
        ];

        for (const handle of handles) {
          if (isInHandle(imagePos, handle)) {
            setDragType("resize");
            setResizeHandle(handle.name);
            setDragStart(imagePos);
            setIsDragging(true);
            return;
          }
        }

        if (
          imagePos.x >= cropArea.x &&
          imagePos.x <= cropArea.x + cropArea.width &&
          imagePos.y >= cropArea.y &&
          imagePos.y <= cropArea.y + cropArea.height
        ) {
          setDragType("move");
          setDragStart(imagePos);
          setIsDragging(true);
          return;
        }
      }

      if (inBounds) {
        setDragType("create");
        setDragStart({ x: Math.round(imagePos.x), y: Math.round(imagePos.y) });
        setCropArea({ x: Math.round(imagePos.x), y: Math.round(imagePos.y), width: 0, height: 0 });
        setIsDragging(true);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const screenPos = getMousePos(e);
    const imagePos = screenToImage(screenPos.x, screenPos.y);
    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    // Update mouse position for brush preview
    if (
      imagePos.x >= 0 &&
      imagePos.x <= displayWidth &&
      imagePos.y >= 0 &&
      imagePos.y <= displayHeight
    ) {
      setMousePos(imagePos);
    } else {
      setMousePos(null);
    }

    // Handle image layer dragging
    if (isDraggingLayer && activeLayerId) {
      const dx = (screenPos.x - layerDragStart.x) / zoom;
      const dy = (screenPos.y - layerDragStart.y) / zoom;

      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (activeLayer && activeLayer.type === "image") {
        updateLayer(activeLayerId, {
          position: {
            x: (activeLayer.position?.x || 0) + dx,
            y: (activeLayer.position?.y || 0) + dy,
          },
        });
      }
      setLayerDragStart({ x: screenPos.x, y: screenPos.y });
      return;
    }

    if (!isDragging) return;

    const ratioValue = getAspectRatioValue(aspectRatio);

    if (dragType === "pan") {
      const dx = screenPos.x - dragStart.x;
      const dy = screenPos.y - dragStart.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setDragStart(screenPos);
      return;
    }

    if (dragType === "draw") {
      const clampedX = Math.max(0, Math.min(imagePos.x, displayWidth));
      const clampedY = Math.max(0, Math.min(imagePos.y, displayHeight));
      drawOnEditCanvas(clampedX, clampedY);
      return;
    }

    // Handle marquee selection
    const activeMode = getActiveToolMode();
    if (activeMode === "marquee") {
      if (dragType === "create" && selection) {
        let width = Math.round(imagePos.x) - dragStart.x;
        let height = Math.round(imagePos.y) - dragStart.y;

        const newX = width < 0 ? dragStart.x + width : dragStart.x;
        const newY = height < 0 ? dragStart.y + height : dragStart.y;

        setSelection({
          x: Math.max(0, newX),
          y: Math.max(0, newY),
          width: Math.min(Math.abs(width), displayWidth - Math.max(0, newX)),
          height: Math.min(Math.abs(height), displayHeight - Math.max(0, newY)),
        });
        return;
      }

      if (dragType === "move" && selection && isMovingSelection && floatingLayerRef.current) {
        const origin = dragStartOriginRef.current;
        if (!origin) return;

        // Calculate total delta from original start position
        let totalDx = imagePos.x - origin.x;
        let totalDy = imagePos.y - origin.y;

        // Shift key constrains to horizontal or vertical movement
        if (e.shiftKey) {
          if (Math.abs(totalDx) > Math.abs(totalDy)) {
            totalDy = 0; // Horizontal constraint
          } else {
            totalDx = 0; // Vertical constraint
          }
        }

        // Calculate new position based on origin position of floating layer
        const baseX = floatingLayerRef.current.originX;
        const baseY = floatingLayerRef.current.originY;
        const newX = Math.max(0, Math.min(baseX + totalDx, displayWidth - selection.width));
        const newY = Math.max(0, Math.min(baseY + totalDy, displayHeight - selection.height));

        floatingLayerRef.current.x = newX;
        floatingLayerRef.current.y = newY;

        // Update selection position (visual selection box follows the floating layer)
        if (!isDuplicating) {
          // When just moving (not duplicating), selection follows
          setSelection({
            ...selection,
            x: newX,
            y: newY,
          });
        }
        // When duplicating, selection stays at original position (we'll show floating layer separately)
        return;
      }
    }

    if (!cropArea) return;

    if (dragType === "create") {
      let width = Math.round(imagePos.x) - dragStart.x;
      let height = Math.round(imagePos.y) - dragStart.y;

      if (ratioValue) {
        height = Math.round(width / ratioValue);
      }

      const newX = width < 0 ? dragStart.x + width : dragStart.x;
      const newY = height < 0 ? dragStart.y + height : dragStart.y;

      setCropArea({
        x: Math.max(0, newX),
        y: Math.max(0, newY),
        width: Math.min(Math.abs(width), displayWidth - Math.max(0, newX)),
        height: Math.min(Math.abs(height), displayHeight - Math.max(0, newY)),
      });
    } else if (dragType === "move") {
      const dx = Math.round(imagePos.x) - dragStart.x;
      const dy = Math.round(imagePos.y) - dragStart.y;
      const newX = Math.max(0, Math.min(cropArea.x + dx, displayWidth - cropArea.width));
      const newY = Math.max(0, Math.min(cropArea.y + dy, displayHeight - cropArea.height));
      setCropArea({ ...cropArea, x: newX, y: newY });
      setDragStart({ x: Math.round(imagePos.x), y: Math.round(imagePos.y) });
    } else if (dragType === "resize" && resizeHandle) {
      const newArea = { ...cropArea };
      const dx = Math.round(imagePos.x) - dragStart.x;
      const dy = Math.round(imagePos.y) - dragStart.y;

      if (resizeHandle.includes("e")) {
        newArea.width = Math.max(20, cropArea.width + dx);
      }
      if (resizeHandle.includes("w")) {
        newArea.x = cropArea.x + dx;
        newArea.width = Math.max(20, cropArea.width - dx);
      }
      if (resizeHandle.includes("s")) {
        newArea.height = Math.max(20, cropArea.height + dy);
      }
      if (resizeHandle.includes("n")) {
        newArea.y = cropArea.y + dy;
        newArea.height = Math.max(20, cropArea.height - dy);
      }

      if (ratioValue) {
        if (resizeHandle.includes("e") || resizeHandle.includes("w")) {
          newArea.height = Math.round(newArea.width / ratioValue);
        } else {
          newArea.width = Math.round(newArea.height * ratioValue);
        }
      }

      newArea.x = Math.max(0, newArea.x);
      newArea.y = Math.max(0, newArea.y);
      newArea.width = Math.min(newArea.width, displayWidth - newArea.x);
      newArea.height = Math.min(newArea.height, displayHeight - newArea.y);

      setCropArea(newArea);
      setDragStart({ x: Math.round(imagePos.x), y: Math.round(imagePos.y) });
    }
  };

  const handleMouseUp = () => {
    // Commit floating layer to edit canvas when done moving
    if (isMovingSelection && floatingLayerRef.current) {
      const editCanvas = editCanvasRef.current;
      const ctx = editCanvas?.getContext("2d");
      if (editCanvas && ctx) {
        const { imageData, x, y } = floatingLayerRef.current;

        // Create temp canvas to draw image data
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.putImageData(imageData, 0, 0);
          ctx.drawImage(tempCanvas, x, y);
        }

        // Update selection to floating layer's final position
        if (isDuplicating) {
          setSelection({
            x: x,
            y: y,
            width: imageData.width,
            height: imageData.height,
          });
        }
      }
      // Clear floating layer after commit
      floatingLayerRef.current = null;
    }

    setIsDragging(false);
    setDragType(null);
    setResizeHandle(null);
    setIsMovingSelection(false);
    setIsDuplicating(false);
    setIsDraggingLayer(false);
    lastDrawPoint.current = null;
    dragStartOriginRef.current = null;

    if (cropArea && (cropArea.width < 10 || cropArea.height < 10)) {
      setCropArea(null);
    }

    if (selection && (selection.width < 5 || selection.height < 5)) {
      setSelection(null);
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    handleMouseUp();
  };

  // Wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!imageSrc) return;
      e.preventDefault();

      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.1, Math.min(10, zoom * zoomFactor));

      const screenPos = getMousePos(e);
      const dx = screenPos.x - canvasRef.current!.width / 2;
      const dy = screenPos.y - canvasRef.current!.height / 2;
      const scale = newZoom / zoom;

      setPan((p) => ({
        x: p.x * scale - dx * (scale - 1),
        y: p.y * scale - dy * (scale - 1),
      }));
      setZoom(newZoom);
    },
    [imageSrc, zoom],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if focus is on input elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
      }

      // Track Alt for marquee tool cursor
      if (e.altKey) setIsAltPressed(true);

      // Tool shortcuts
      if (e.key === "c" && !e.metaKey && !e.ctrlKey) setToolMode("crop");
      if (e.key === "h") setToolMode("hand");
      if (e.key === "z" && !e.metaKey && !e.ctrlKey) setToolMode("zoom");
      if (e.key === "b") setToolMode("brush");
      if (e.key === "e") setToolMode("eraser");
      if (e.key === "g") setToolMode("fill");
      if (e.key === "i") setToolMode("eyedropper");
      if (e.key === "s" && !e.metaKey && !e.ctrlKey) setToolMode("stamp");
      if (e.key === "m") setToolMode("marquee");

      // Brush size shortcuts
      if (e.key === "[" || (e.key === "-" && !e.metaKey && !e.ctrlKey)) {
        setBrushSize((s) => Math.max(1, s - (e.shiftKey ? 10 : 1)));
      }
      if (e.key === "]" || (e.key === "=" && !e.metaKey && !e.ctrlKey)) {
        setBrushSize((s) => Math.min(200, s + (e.shiftKey ? 10 : 1)));
      }

      // Zoom shortcuts
      if ((e.key === "=" || e.key === "+") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom((z) => Math.min(10, z * 1.25));
      }
      if (e.key === "-" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom((z) => Math.max(0.1, z * 0.8));
      }
      if (e.key === "0" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }

      // Undo/Redo shortcuts
      if (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (
        (e.key === "z" && (e.metaKey || e.ctrlKey) && e.shiftKey) ||
        (e.key === "y" && (e.metaKey || e.ctrlKey))
      ) {
        e.preventDefault();
        redo();
      }

      // Copy (Cmd+C)
      if (e.key === "c" && (e.metaKey || e.ctrlKey) && selection) {
        e.preventDefault();
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        const img = imageRef.current;
        const editCanvas = editCanvasRef.current;
        if (!canvas || !ctx || !img) return;

        const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

        // Create composite canvas
        const compositeCanvas = document.createElement("canvas");
        compositeCanvas.width = displayWidth;
        compositeCanvas.height = displayHeight;
        const compositeCtx = compositeCanvas.getContext("2d");
        if (!compositeCtx) return;

        // Draw rotated original
        compositeCtx.translate(displayWidth / 2, displayHeight / 2);
        compositeCtx.rotate((rotation * Math.PI) / 180);
        compositeCtx.drawImage(img, -imageSize.width / 2, -imageSize.height / 2);
        compositeCtx.setTransform(1, 0, 0, 1, 0, 0);

        // Draw edits
        if (editCanvas) {
          compositeCtx.drawImage(editCanvas, 0, 0);
        }

        // Copy selection to clipboard
        const imageData = compositeCtx.getImageData(
          Math.round(selection.x),
          Math.round(selection.y),
          Math.round(selection.width),
          Math.round(selection.height),
        );
        clipboardRef.current = imageData;
      }

      // Paste (Cmd+V)
      if (e.key === "v" && (e.metaKey || e.ctrlKey) && clipboardRef.current) {
        e.preventDefault();
        const editCanvas = editCanvasRef.current;
        const ctx = editCanvas?.getContext("2d");
        if (!editCanvas || !ctx) return;

        const clipData = clipboardRef.current;
        const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

        saveToHistory();

        // Create temp canvas to draw clipboard data
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = clipData.width;
        tempCanvas.height = clipData.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;
        tempCtx.putImageData(clipData, 0, 0);

        // Paste at center or at current selection position
        const pasteX = selection ? selection.x : (displayWidth - clipData.width) / 2;
        const pasteY = selection ? selection.y : (displayHeight - clipData.height) / 2;

        ctx.drawImage(tempCanvas, pasteX, pasteY);

        // Create floating layer for move operation
        floatingLayerRef.current = {
          imageData: clipData,
          x: pasteX,
          y: pasteY,
          originX: pasteX,
          originY: pasteY,
        };

        // Update selection to new position
        setSelection({
          x: pasteX,
          y: pasteY,
          width: clipData.width,
          height: clipData.height,
        });
      }

      // Escape to clear selection
      if (e.key === "Escape") {
        if (isProjectListOpen) {
          setIsProjectListOpen(false);
        } else {
          setSelection(null);
          floatingLayerRef.current = null;
        }
      }

      // Save (Cmd+S) - handled separately
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
      if (!e.altKey) setIsAltPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    undo,
    redo,
    selection,
    getDisplayDimensions,
    rotation,
    imageSize,
    saveToHistory,
    isProjectListOpen,
  ]);

  // Update crop area when aspect ratio changes
  useEffect(() => {
    if (!cropArea) return;
    const ratioValue = getAspectRatioValue(aspectRatio);
    if (!ratioValue) return;

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    const centerX = cropArea.x + cropArea.width / 2;
    const centerY = cropArea.y + cropArea.height / 2;

    let newWidth = cropArea.width;
    let newHeight = cropArea.width / ratioValue;

    if (newHeight > displayHeight) {
      newHeight = displayHeight;
      newWidth = newHeight * ratioValue;
    }

    if (newWidth > displayWidth) {
      newWidth = displayWidth;
      newHeight = newWidth / ratioValue;
    }

    let newX = Math.round(centerX - newWidth / 2);
    let newY = Math.round(centerY - newHeight / 2);

    newX = Math.max(0, Math.min(newX, displayWidth - newWidth));
    newY = Math.max(0, Math.min(newY, displayHeight - newHeight));

    setCropArea({
      x: newX,
      y: newY,
      width: Math.round(newWidth),
      height: Math.round(newHeight),
    });
  }, [aspectRatio]);

  // Actions
  const rotate = (deg: number) => {
    setRotation((r) => (r + deg + 360) % 360);
    setCropArea(null);
    // Reinitialize edit canvas for new dimensions
    const { width, height } = getDisplayDimensions();
    initEditCanvas(rotation % 180 === 0 ? height : width, rotation % 180 === 0 ? width : height);
  };

  const selectAll = () => {
    const { width, height } = getDisplayDimensions();
    const ratioValue = getAspectRatioValue(aspectRatio);

    if (ratioValue) {
      let newWidth = width;
      let newHeight = width / ratioValue;

      if (newHeight > height) {
        newHeight = height;
        newWidth = height * ratioValue;
      }

      const x = Math.round((width - newWidth) / 2);
      const y = Math.round((height - newHeight) / 2);

      setCropArea({ x, y, width: Math.round(newWidth), height: Math.round(newHeight) });
    } else {
      setCropArea({ x: 0, y: 0, width, height });
    }
  };

  const clearCrop = () => {
    setCropArea(null);
  };

  const clearEdits = () => {
    if (confirm(t.clearEditConfirm)) {
      const { width, height } = getDisplayDimensions();
      initEditCanvas(width, height);
    }
  };

  const fitToScreen = () => {
    if (!containerRef.current || !imageSize.width) return;
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
    compositeCtx.drawImage(img, -imageSize.width / 2, -imageSize.height / 2);
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
  }, [cropArea, rotation, imageSize, outputFormat, quality, getDisplayDimensions]);

  // Get cursor based on tool mode
  const getCursor = () => {
    const activeMode = getActiveToolMode();
    if (activeMode === "hand") return isDragging ? "grabbing" : "grab";
    if (activeMode === "zoom") return "zoom-in";
    if (activeMode === "eyedropper") return "crosshair";
    if (activeMode === "fill") return "crosshair";
    if (activeMode === "brush" || activeMode === "eraser" || activeMode === "stamp") return "none";
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
        // Only restore if autosave exists AND no image has been loaded yet
        if (data && data.imageSrc && !imageSrc) {
          // Restore state from autosave
          setImageSrc(data.imageSrc);
          setImageSize(data.imageSize);
          setRotation(data.rotation);
          setZoom(data.zoom);
          setPan(data.pan);
          setProjectName(data.projectName);
          setActiveLayerId(data.activeLayerId);
          setBrushSize(data.brushSize);
          setBrushColor(data.brushColor);
          setBrushHardness(data.brushHardness);

          // Load image and restore layers
          const img = new Image();
          img.onload = () => {
            imageRef.current = img;
            const { width, height } = data.imageSize;
            initEditCanvas(width, height, data.layers);
          };
          img.src = data.imageSrc;
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
    if (!imageSrc) return;

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
        imageSrc,
        imageSize,
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
    imageSrc,
    imageSize,
    rotation,
    zoom,
    pan,
    projectName,
    layers,
    activeLayerId,
    brushSize,
    brushColor,
    brushHardness,
  ]);

  // Clear autosave when starting fresh
  const handleNewProject = useCallback(() => {
    clearEditorAutosaveData();
    setImageSrc(null);
    setImageSize({ width: 0, height: 0 });
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
    setLayerImages(new Map());
    editCanvasRef.current = null;
    imageRef.current = null;
  }, []);

  // Save current project
  const handleSaveProject = useCallback(async () => {
    if (!imageSrc || !imageRef.current) return;

    // Save all unified layer data
    const savedLayers: UnifiedLayer[] = layers.map((layer) => {
      if (layer.type === "paint") {
        const canvas = layerCanvasesRef.current.get(layer.id);
        return {
          ...layer,
          paintData: canvas ? canvas.toDataURL("image/png") : layer.paintData || "",
        };
      }
      // Image layers don't need canvas data saved - they have imageSrc
      return { ...layer };
    });

    // Legacy editLayerData for backward compatibility (first paint layer)
    const editCanvas = editCanvasRef.current;
    const editLayerData = editCanvas ? editCanvas.toDataURL("image/png") : "";

    const project: SavedImageProject = {
      id: currentProjectId || crypto.randomUUID(),
      name: projectName,
      imageSrc,
      editLayerData,
      unifiedLayers: savedLayers,
      activeLayerId: activeLayerId || undefined,
      imageSize,
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
  }, [imageSrc, projectName, imageSize, rotation, currentProjectId, layers, activeLayerId]);

  // Cmd+S keyboard shortcut for save
  useEffect(() => {
    const handleSave = (e: KeyboardEvent) => {
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (imageSrc) {
          handleSaveProject();
        }
      }
    };

    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [imageSrc, handleSaveProject]);

  // Load a saved project
  const handleLoadProject = useCallback(
    async (project: SavedImageProject) => {
      setImageSrc(project.imageSrc);
      setProjectName(project.name);
      setCurrentProjectId(project.id);
      setRotation(project.rotation);
      setImageSize(project.imageSize);
      setCropArea(null);
      setSelection(null);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setStampSource(null);

      // Load image
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;

        // Initialize edit canvas with layers
        const { width, height } =
          project.rotation % 180 === 0
            ? project.imageSize
            : { width: project.imageSize.height, height: project.imageSize.width };

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
      };
      img.src = project.imageSrc;

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
    if (imageSrc && !confirm(t.unsavedChangesConfirm)) return;

    // Clear autosave
    clearEditorAutosaveData();

    // Reset image state
    setImageSrc(null);
    setImageSize({ width: 0, height: 0 });
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
    setLayerImages(new Map());

    // Reset refs
    imageRef.current = null;
    editCanvasRef.current = null;
    historyRef.current = [];
    historyIndexRef.current = -1;
  }, [imageSrc, t]);

  const toolButtons: {
    mode: ToolMode;
    icon: React.ReactNode;
    name: string;
    description: string;
    shortcut: string;
  }[] = [
    {
      mode: "marquee",
      name: t.marquee,
      description: "⌥+drag: clone | ⇧: axis lock",
      shortcut: "M",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" strokeWidth={2} strokeDasharray="4 2" rx="1" />
        </svg>
      ),
    },
    {
      mode: "brush",
      name: t.brush,
      description: t.brushToolTip,
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
      shortcut: "E",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      ),
    },
    {
      mode: "fill",
      name: t.fill,
      description: t.fillToolTip,
      shortcut: "G",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
          />
        </svg>
      ),
    },
    {
      mode: "eyedropper",
      name: t.eyedropper,
      description: t.eyedropperToolTip,
      shortcut: "I",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
          />
        </svg>
      ),
    },
    {
      mode: "stamp",
      name: t.cloneStamp,
      description: t.cloneStampToolTip,
      shortcut: "S",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      ),
    },
    {
      mode: "crop",
      name: t.crop,
      description: t.cropToolTip,
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
      {/* Top Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-primary border-b border-border-default shrink-0 shadow-sm h-12">
        <h1 className="text-sm font-semibold">{t.imageEditor}</h1>

        <div className="h-5 w-px bg-border-default" />

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
        {imageSrc && (
          <button
            onClick={handleSaveProject}
            className="px-2 py-1 bg-accent-success hover:bg-accent-success/80 text-white rounded text-xs transition-colors"
            title={`${t.save} (⌘S)`}
          >
            {t.save}
          </button>
        )}

        {imageSrc && (
          <>
            <div className="h-5 w-px bg-border-default" />

            {/* Project name */}
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="px-2 py-0.5 bg-surface-secondary border border-border-default rounded text-xs w-24 focus:outline-none focus:border-accent-primary"
              placeholder={t.projectName}
            />

            <div className="h-5 w-px bg-border-default" />

            {/* Tool buttons */}
            <div className="flex gap-0.5 bg-surface-secondary rounded p-0.5">
              {toolButtons.map((tool) => (
                <Tooltip
                  key={tool.mode}
                  content={
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{tool.name}</span>
                      <span className="text-text-tertiary text-[10px]">{tool.description}</span>
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
            </div>

            <div className="h-5 w-px bg-border-default" />

            {/* Brush controls */}
            {(toolMode === "brush" || toolMode === "eraser" || toolMode === "stamp") && (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-secondary">{t.size}:</span>
                  <button
                    onClick={() => setBrushSize((s) => Math.max(1, s - 1))}
                    className="w-5 h-5 flex items-center justify-center hover:bg-interactive-hover rounded text-xs"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={brushSize}
                    onChange={(e) =>
                      setBrushSize(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))
                    }
                    className="w-10 px-1 py-0.5 bg-surface-secondary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
                    min={1}
                    max={200}
                  />
                  <button
                    onClick={() => setBrushSize((s) => Math.min(200, s + 1))}
                    className="w-5 h-5 flex items-center justify-center hover:bg-interactive-hover rounded text-xs"
                  >
                    +
                  </button>
                </div>

                {(toolMode === "brush" || toolMode === "eraser") && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-text-secondary">{t.hardness}:</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={brushHardness}
                      onChange={(e) => setBrushHardness(parseInt(e.target.value))}
                      className="w-14 accent-accent-primary"
                    />
                    <span className="text-xs text-text-tertiary w-6">{brushHardness}%</span>
                  </div>
                )}

                {toolMode === "brush" && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-text-secondary">{t.color}:</span>
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(e) => setBrushColor(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border border-border-default"
                    />
                    <span className="text-xs text-text-tertiary">{brushColor}</span>
                  </div>
                )}

                {toolMode === "stamp" && (
                  <span className="text-xs text-text-secondary">
                    {stampSource
                      ? `${t.source}: (${Math.round(stampSource.x)}, ${Math.round(stampSource.y)})`
                      : t.altClickToSetSource}
                  </span>
                )}

                <div className="h-5 w-px bg-border-default" />
              </>
            )}

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

            <div className="h-5 w-px bg-border-default" />

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

            <div className="h-5 w-px bg-border-default" />

            {/* Crop ratio */}
            {toolMode === "crop" && (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-secondary">Ratio:</span>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                    className="px-1 py-0.5 bg-surface-secondary border border-border-default rounded text-xs focus:outline-none focus:border-accent-primary"
                  >
                    {ASPECT_RATIOS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={selectAll}
                    className="px-1 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
                  >
                    All
                  </button>
                  {cropArea && (
                    <button
                      onClick={clearCrop}
                      className="px-1 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="h-5 w-px bg-border-default" />
              </>
            )}

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
          </>
        )}

        <div className="flex-1" />

        {/* Image info */}
        {imageSrc && (
          <div className="text-xs text-text-tertiary flex items-center gap-2">
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

      {/* Main Content Area with Docking System */}
      <EditorLayoutProvider>
        <div className="h-full w-full flex overflow-hidden relative">
          <EditorDockableArea />
        </div>
      </EditorLayoutProvider>

      {/* Bottom status bar */}
      {imageSrc && (
        <div className="px-4 py-1.5 bg-surface-primary border-t border-border-default text-xs text-text-tertiary flex items-center gap-4">
          <span>
            Original: {imageSize.width} × {imageSize.height}
          </span>
          {rotation !== 0 && <span>Rotation: {rotation}°</span>}
          <span>Zoom: {Math.round(zoom * 100)}%</span>
          {cropArea && (
            <span className="text-accent-primary">
              Crop: {Math.round(cropArea.width)} × {Math.round(cropArea.height)} at (
              {Math.round(cropArea.x)}, {Math.round(cropArea.y)})
            </span>
          )}
          {selection && (
            <span className="text-accent-success">
              Selection: {Math.round(selection.width)} × {Math.round(selection.height)} at (
              {Math.round(selection.x)}, {Math.round(selection.y)})
            </span>
          )}
          <div className="flex-1" />
          <span className="text-text-quaternary">
            ⌘Z: 실행취소 | ⌘⇧Z: 다시실행 | M: 선택 | ⌘C/V: 복사/붙여넣기 | ⌥+드래그: 복제 | ⇧:
            수평/수직 고정
          </span>
        </div>
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
