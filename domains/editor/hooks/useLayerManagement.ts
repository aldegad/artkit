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
  renameLayer: (layerId: string, name: string) => void;
  toggleLayerLock: (layerId: string) => void;
  moveLayer: (layerId: string, direction: "up" | "down") => void;
  reorderLayers: (fromId: string, toId: string) => void;
  mergeLayerDown: (layerId: string) => void;
  duplicateLayer: (layerId: string) => void;

  // Initialization
  initLayers: (width: number, height: number, existingLayers?: UnifiedLayer[]) => void;

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
    (width: number, height: number, existingLayers?: UnifiedLayer[]) => {
      layerCanvasesRef.current.clear();

      if (existingLayers && existingLayers.length > 0) {
        setLayers(existingLayers);
        const firstPaintLayer = existingLayers.find(l => l.type === "paint");
        setActiveLayerId(firstPaintLayer?.id || existingLayers[0].id);

        // All layers are paint layers now
        existingLayers.forEach((layer) => {
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
            };
            img.src = layer.paintData;
          }
        });

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
  }, [layers, getDisplayDimensions]);

  return {
    // State
    layers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
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
    renameLayer,
    toggleLayerLock,
    moveLayer,
    reorderLayers,
    mergeLayerDown,
    duplicateLayer,

    // Initialization
    initLayers,

    // Legacy alias
    addLayer: addPaintLayer,
  };
}
