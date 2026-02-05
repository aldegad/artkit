"use client";

import { useState, useCallback, useRef, MutableRefObject } from "react";
import { UnifiedLayer, createPaintLayer } from "../types";

// ============================================
// Types
// ============================================

interface UseLayerManagementOptions {
  getDisplayDimensions: () => { width: number; height: number };
  saveToHistory?: () => void; // Optional - if not provided, history won't be saved
  editCanvasRef?: MutableRefObject<HTMLCanvasElement | null>; // Optional - if provided, use external ref
  translations: {
    layer: string;
    minOneLayerRequired: string;
  };
}

interface UseLayerManagementReturn {
  // State
  layers: UnifiedLayer[];
  setLayers: React.Dispatch<React.SetStateAction<UnifiedLayer[]>>;
  activeLayerId: string | null;
  setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  // Multi-select state
  selectedLayerIds: string[];
  setSelectedLayerIds: React.Dispatch<React.SetStateAction<string[]>>;
  layerImages: Map<string, HTMLImageElement>;
  setLayerImages: React.Dispatch<React.SetStateAction<Map<string, HTMLImageElement>>>;
  // Drag state for layer panel reordering
  draggedLayerId: string | null;
  setDraggedLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  dragOverLayerId: string | null;
  setDragOverLayerId: React.Dispatch<React.SetStateAction<string | null>>;

  // Refs
  layerCanvasesRef: MutableRefObject<Map<string, HTMLCanvasElement>>;
  editCanvasRef: MutableRefObject<HTMLCanvasElement | null>;

  // Actions
  addPaintLayer: () => void;
  addImageLayer: (imageSrc: string, name?: string) => void;
  deleteLayer: (layerId: string) => void;
  selectLayer: (layerId: string) => void;
  toggleLayerVisibility: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<UnifiedLayer>) => void;
  updateLayerOpacity: (layerId: string, opacity: number) => void;
  updateLayerPosition: (layerId: string, position: { x: number; y: number }) => void;
  updateMultipleLayerPositions: (updates: Array<{ layerId: string; position: { x: number; y: number } }>) => void;
  renameLayer: (layerId: string, name: string) => void;
  toggleLayerLock: (layerId: string) => void;
  moveLayer: (layerId: string, direction: "up" | "down") => void;
  reorderLayers: (fromId: string, toId: string) => void;
  mergeLayerDown: (layerId: string) => void;
  duplicateLayer: (layerId: string) => void;
  rotateAllLayerCanvases: (degrees: number) => void;

  // Multi-select actions
  selectLayerWithModifier: (layerId: string, shiftKey: boolean) => void;
  clearLayerSelection: () => void;

  // Alignment actions
  alignLayers: (
    alignment: "left" | "center" | "right" | "top" | "middle" | "bottom",
    bounds?: { x: number; y: number; width: number; height: number }
  ) => void;
  distributeLayers: (
    direction: "horizontal" | "vertical",
    bounds?: { x: number; y: number; width: number; height: number }
  ) => void;

  // Initialization
  initLayers: (width: number, height: number, existingLayers?: UnifiedLayer[]) => Promise<void>;

  // Legacy alias
  addLayer: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useLayerManagement(
  options: UseLayerManagementOptions
): UseLayerManagementReturn {
  const { getDisplayDimensions, saveToHistory, editCanvasRef: externalEditCanvasRef, translations: t } = options;

  // State
  const [layers, setLayers] = useState<UnifiedLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [layerImages, setLayerImages] = useState<Map<string, HTMLImageElement>>(new Map());
  // Drag state for layer panel reordering
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);

  // Refs
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const internalEditCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Use external ref if provided, otherwise use internal
  const editCanvasRef = externalEditCanvasRef || internalEditCanvasRef;

  // Initialize layers
  const initLayers = useCallback(
    async (width: number, height: number, existingLayers?: UnifiedLayer[]): Promise<void> => {
      layerCanvasesRef.current.clear();

      if (existingLayers && existingLayers.length > 0) {
        setLayers(existingLayers);
        const firstPaintLayer = existingLayers.find(l => l.type === "paint");
        setActiveLayerId(firstPaintLayer?.id || existingLayers[0].id);

        // Load all layer images in parallel and wait for completion
        const loadPromises = existingLayers.map((layer) => {
          return new Promise<void>((resolve) => {
            const layerWidth = layer.originalSize?.width || width;
            const layerHeight = layer.originalSize?.height || height;
            const canvas = document.createElement("canvas");
            canvas.width = layerWidth;
            canvas.height = layerHeight;
            layerCanvasesRef.current.set(layer.id, canvas);

            if (layer.paintData) {
              const img = new Image();
              img.onload = () => {
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.drawImage(img, 0, 0);
                resolve();
              };
              img.onerror = () => {
                console.error(`Failed to load image for layer ${layer.id}`);
                resolve(); // Resolve anyway to not block other layers
              };
              img.src = layer.paintData;
            } else {
              resolve();
            }
          });
        });

        // Wait for all images to load
        await Promise.all(loadPromises);

        // Force re-render by setting layers again with a new array reference
        // This ensures useCanvasRendering's useEffect runs after images are loaded
        setLayers([...existingLayers]);

        if (firstPaintLayer) {
          editCanvasRef.current = layerCanvasesRef.current.get(firstPaintLayer.id) || null;
        }
      } else {
        const defaultLayer = createPaintLayer(`${t.layer} 1`, 0);
        setLayers([defaultLayer]);
        setActiveLayerId(defaultLayer.id);

        const editCanvas = document.createElement("canvas");
        editCanvas.width = width;
        editCanvas.height = height;
        layerCanvasesRef.current.set(defaultLayer.id, editCanvas);
        editCanvasRef.current = editCanvas;
      }
    },
    [t.layer]
  );

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

    setLayers((prev) => [newLayer, ...prev]);
    setActiveLayerId(newLayer.id);
    editCanvasRef.current = canvas;
  }, [layers, getDisplayDimensions, t.layer]);

  // Add new layer with image drawn to canvas
  const addImageLayer = useCallback((imageSrc: string, name?: string) => {
    const img = new Image();
    img.onload = () => {
      const maxZIndex = layers.length > 0 ? Math.max(...layers.map(l => l.zIndex)) + 1 : 0;
      const newLayer = createPaintLayer(
        name || `${t.layer} ${layers.length + 1}`,
        maxZIndex
      );
      newLayer.originalSize = { width: img.width, height: img.height };

      // Create canvas and draw the image
      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = img.width;
      layerCanvas.height = img.height;
      const ctx = layerCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
      layerCanvasesRef.current.set(newLayer.id, layerCanvas);

      setLayers((prev) => [newLayer, ...prev]);
      setActiveLayerId(newLayer.id);
      editCanvasRef.current = layerCanvas;
    };
    img.src = imageSrc;
  }, [layers, t.layer]);

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
        if (activeLayerId === layerId && newLayers.length > 0) {
          const nextLayer = newLayers[0];
          setActiveLayerId(nextLayer.id);
          if (nextLayer.type === "paint") {
            editCanvasRef.current = layerCanvasesRef.current.get(nextLayer.id) || null;
          }
        }
        return newLayers;
      });

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
    [layers, activeLayerId, t.minOneLayerRequired]
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

  // Update layer position
  const updateLayerPosition = useCallback((layerId: string, position: { x: number; y: number }) => {
    updateLayer(layerId, { position });
  }, [updateLayer]);

  // Update multiple layer positions (batch update for multi-layer move)
  const updateMultipleLayerPositions = useCallback((
    updates: Array<{ layerId: string; position: { x: number; y: number } }>
  ) => {
    setLayers(prev => prev.map(layer => {
      const update = updates.find(u => u.layerId === layer.id);
      if (!update) return layer;
      return { ...layer, position: update.position };
    }));
  }, []);

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

  // Merge paint layer down
  const mergeLayerDown = useCallback(
    (layerId: string) => {
      const idx = layers.findIndex((l) => l.id === layerId);
      if (idx === -1 || idx === layers.length - 1) return;

      const upperLayer = layers[idx];
      const lowerLayer = layers[idx + 1];

      if (upperLayer.type !== "paint" || lowerLayer.type !== "paint") return;

      const upperCanvas = layerCanvasesRef.current.get(layerId);
      const lowerCanvas = layerCanvasesRef.current.get(lowerLayer.id);

      if (!upperCanvas || !lowerCanvas) return;

      saveToHistory?.();

      const ctx = lowerCanvas.getContext("2d");
      if (ctx) {
        ctx.globalAlpha = upperLayer.opacity / 100;
        ctx.drawImage(upperCanvas, 0, 0);
        ctx.globalAlpha = 1;
      }

      deleteLayer(layerId);
    },
    [layers, saveToHistory, deleteLayer]
  );

  // Rotate all layer canvases by degrees (90, -90, 180)
  const rotateAllLayerCanvases = useCallback((degrees: number) => {
    const normalizedDeg = ((degrees % 360) + 360) % 360;
    const isSwapDimensions = normalizedDeg === 90 || normalizedDeg === 270;

    layerCanvasesRef.current.forEach((canvas, layerId) => {
      const oldWidth = canvas.width;
      const oldHeight = canvas.height;

      // Create temp canvas to store current content
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = oldWidth;
      tempCanvas.height = oldHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0);
      }

      // Resize canvas for rotation (swap dimensions for 90/270)
      const newWidth = isSwapDimensions ? oldHeight : oldWidth;
      const newHeight = isSwapDimensions ? oldWidth : oldHeight;
      canvas.width = newWidth;
      canvas.height = newHeight;

      // Draw rotated content
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.save();
        ctx.translate(newWidth / 2, newHeight / 2);
        ctx.rotate((normalizedDeg * Math.PI) / 180);
        ctx.drawImage(tempCanvas, -oldWidth / 2, -oldHeight / 2);
        ctx.restore();
      }

      // Update layer originalSize if exists
      const layer = layers.find(l => l.id === layerId);
      if (layer?.originalSize && isSwapDimensions) {
        setLayers(prev => prev.map(l =>
          l.id === layerId
            ? { ...l, originalSize: { width: l.originalSize!.height, height: l.originalSize!.width } }
            : l
        ));
      }
    });
  }, [layers]);

  // Duplicate layer (all layers are paint layers now)
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

    // Copy the layer canvas
    const srcCanvas = layerCanvasesRef.current.get(layerId);
    if (srcCanvas) {
      const newCanvas = document.createElement("canvas");
      newCanvas.width = srcCanvas.width;
      newCanvas.height = srcCanvas.height;
      const ctx = newCanvas.getContext("2d");
      if (ctx) ctx.drawImage(srcCanvas, 0, 0);
      layerCanvasesRef.current.set(newLayer.id, newCanvas);
    } else {
      // Fallback: create empty canvas with display dimensions
      const { width, height } = getDisplayDimensions();
      const newCanvas = document.createElement("canvas");
      newCanvas.width = layer.originalSize?.width || width;
      newCanvas.height = layer.originalSize?.height || height;
      layerCanvasesRef.current.set(newLayer.id, newCanvas);
    }

    setLayers(prev => [newLayer, ...prev]);
    setActiveLayerId(newLayer.id);
    setSelectedLayerIds([newLayer.id]);
  }, [layers, getDisplayDimensions]);

  // Select layer with modifier (shift for range multi-select)
  const selectLayerWithModifier = useCallback((layerId: string, shiftKey: boolean) => {
    if (shiftKey && activeLayerId) {
      // Shift-click: range selection from activeLayerId to clicked layer
      // Sort layers by zIndex (descending, as displayed in panel)
      const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);
      const activeIndex = sortedLayers.findIndex(l => l.id === activeLayerId);
      const clickedIndex = sortedLayers.findIndex(l => l.id === layerId);

      if (activeIndex !== -1 && clickedIndex !== -1) {
        // Get range of layers between active and clicked
        const startIndex = Math.min(activeIndex, clickedIndex);
        const endIndex = Math.max(activeIndex, clickedIndex);
        const rangeIds = sortedLayers
          .slice(startIndex, endIndex + 1)
          .map(l => l.id);

        setSelectedLayerIds(rangeIds);
      }
      // Keep activeLayerId as the anchor (don't change it)
    } else {
      // Normal click: single select
      setSelectedLayerIds([layerId]);
      setActiveLayerId(layerId);
      const layer = layers.find(l => l.id === layerId);
      if (layer?.type === "paint") {
        editCanvasRef.current = layerCanvasesRef.current.get(layerId) || null;
      }
    }
  }, [layers, activeLayerId]);

  // Clear layer selection
  const clearLayerSelection = useCallback(() => {
    setSelectedLayerIds([]);
  }, []);

  // Get layer content bounds (position + actual content size, not canvas size)
  // This scans for non-transparent pixels to find the actual content area
  const getLayerBounds = useCallback((layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return null;

    const canvas = layerCanvasesRef.current.get(layerId);
    if (!canvas) {
      // Fallback to originalSize if no canvas
      const width = layer.originalSize?.width || 0;
      const height = layer.originalSize?.height || 0;
      const x = layer.position?.x || 0;
      const y = layer.position?.y || 0;
      return { x, y, width, height };
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      const width = canvas.width;
      const height = canvas.height;
      const x = layer.position?.x || 0;
      const y = layer.position?.y || 0;
      return { x, y, width, height };
    }

    // Scan for actual content bounds (non-transparent pixels)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    let hasContent = false;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const alpha = imageData.data[(y * canvas.width + x) * 4 + 3];
        if (alpha > 0) {
          hasContent = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (!hasContent) {
      // No content, return zero-size bounds at position
      return { x: layer.position?.x || 0, y: layer.position?.y || 0, width: 0, height: 0 };
    }

    // Return content bounds in image coordinates (layer position + content offset)
    const layerPosX = layer.position?.x || 0;
    const layerPosY = layer.position?.y || 0;

    return {
      x: layerPosX + minX,
      y: layerPosY + minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }, [layers]);

  // Align layers
  const alignLayers = useCallback((
    alignment: "left" | "center" | "right" | "top" | "middle" | "bottom",
    bounds?: { x: number; y: number; width: number; height: number }
  ) => {
    const targetIds = selectedLayerIds.length > 0 ? selectedLayerIds : (activeLayerId ? [activeLayerId] : []);
    if (targetIds.length === 0) return;

    // Get alignment bounds (selection or canvas)
    const alignBounds = bounds || { x: 0, y: 0, ...getDisplayDimensions() };

    setLayers(prev => prev.map(layer => {
      if (!targetIds.includes(layer.id)) return layer;

      const layerBounds = getLayerBounds(layer.id);
      if (!layerBounds || layerBounds.width === 0 || layerBounds.height === 0) return layer;

      const currentPosX = layer.position?.x || 0;
      const currentPosY = layer.position?.y || 0;

      // Content offset within layer canvas
      // layerBounds.x is the content's position in image coordinates
      // contentOffsetX is how far the content is from the layer canvas origin
      const contentOffsetX = layerBounds.x - currentPosX;
      const contentOffsetY = layerBounds.y - currentPosY;

      // Calculate where the content should be in image coordinates
      let targetContentX = layerBounds.x;
      let targetContentY = layerBounds.y;

      switch (alignment) {
        case "left":
          targetContentX = alignBounds.x;
          break;
        case "center":
          targetContentX = alignBounds.x + (alignBounds.width - layerBounds.width) / 2;
          break;
        case "right":
          targetContentX = alignBounds.x + alignBounds.width - layerBounds.width;
          break;
        case "top":
          targetContentY = alignBounds.y;
          break;
        case "middle":
          targetContentY = alignBounds.y + (alignBounds.height - layerBounds.height) / 2;
          break;
        case "bottom":
          targetContentY = alignBounds.y + alignBounds.height - layerBounds.height;
          break;
      }

      // Calculate new layer position by subtracting content offset
      // If content should be at targetContentX, and content is at offset within canvas,
      // then layer position = targetContentX - contentOffsetX
      const newX = targetContentX - contentOffsetX;
      const newY = targetContentY - contentOffsetY;

      return {
        ...layer,
        position: { x: newX, y: newY },
      };
    }));
  }, [selectedLayerIds, activeLayerId, getDisplayDimensions, getLayerBounds]);

  // Distribute layers evenly
  const distributeLayers = useCallback((
    direction: "horizontal" | "vertical",
    bounds?: { x: number; y: number; width: number; height: number }
  ) => {
    const targetIds = selectedLayerIds.length > 1 ? selectedLayerIds : [];
    if (targetIds.length < 2) return; // Need at least 2 layers to distribute

    // Get alignment bounds (selection or canvas)
    const alignBounds = bounds || { x: 0, y: 0, ...getDisplayDimensions() };

    // Get all layer bounds and sort by position
    const layerBoundsList = targetIds
      .map(id => {
        const layer = layers.find(l => l.id === id);
        const layerBounds = getLayerBounds(id);
        return { id, bounds: layerBounds, layer };
      })
      .filter((item): item is { id: string; bounds: NonNullable<ReturnType<typeof getLayerBounds>>; layer: NonNullable<typeof item.layer> } =>
        item.bounds !== null && item.layer !== undefined
      )
      .sort((a, b) =>
        direction === "horizontal"
          ? a.bounds.x - b.bounds.x
          : a.bounds.y - b.bounds.y
      );

    if (layerBoundsList.length < 2) return;

    if (direction === "horizontal") {
      const totalWidth = layerBoundsList.reduce((sum, item) => sum + item.bounds.width, 0);
      const availableSpace = alignBounds.width - totalWidth;
      const gap = availableSpace / (layerBoundsList.length - 1);

      let currentX = alignBounds.x;
      setLayers(prev => prev.map(layer => {
        const item = layerBoundsList.find(i => i.id === layer.id);
        if (!item) return layer;

        // Content offset within layer canvas
        const currentPosX = layer.position?.x || 0;
        const contentOffsetX = item.bounds.x - currentPosX;

        // Target content position
        const targetContentX = currentX;
        currentX += item.bounds.width + gap;

        // New layer position = target content position - content offset
        const newX = targetContentX - contentOffsetX;

        return {
          ...layer,
          position: { x: newX, y: layer.position?.y || 0 },
        };
      }));
    } else {
      const totalHeight = layerBoundsList.reduce((sum, item) => sum + item.bounds.height, 0);
      const availableSpace = alignBounds.height - totalHeight;
      const gap = availableSpace / (layerBoundsList.length - 1);

      let currentY = alignBounds.y;
      setLayers(prev => prev.map(layer => {
        const item = layerBoundsList.find(i => i.id === layer.id);
        if (!item) return layer;

        // Content offset within layer canvas
        const currentPosY = layer.position?.y || 0;
        const contentOffsetY = item.bounds.y - currentPosY;

        // Target content position
        const targetContentY = currentY;
        currentY += item.bounds.height + gap;

        // New layer position = target content position - content offset
        const newY = targetContentY - contentOffsetY;

        return {
          ...layer,
          position: { x: layer.position?.x || 0, y: newY },
        };
      }));
    }
  }, [selectedLayerIds, getDisplayDimensions, getLayerBounds]);

  return {
    // State
    layers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
    selectedLayerIds,
    setSelectedLayerIds,
    layerImages,
    setLayerImages,
    // Drag state
    draggedLayerId,
    setDraggedLayerId,
    dragOverLayerId,
    setDragOverLayerId,

    // Refs
    layerCanvasesRef,
    editCanvasRef,

    // Actions
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

    // Multi-select actions
    selectLayerWithModifier,
    clearLayerSelection,

    // Alignment actions
    alignLayers,
    distributeLayers,

    // Initialization
    initLayers,

    // Legacy alias
    addLayer: addPaintLayer,
  };
}
