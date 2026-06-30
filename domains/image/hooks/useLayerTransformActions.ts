"use client";

import { useCallback, type RefObject } from "react";
import type { UnifiedLayer } from "../types";
import { getLayerContentBounds } from "../utils/layerContentBounds";

interface UseLayerTransformActionsOptions {
  selectedLayerIds: string[];
  resizeSelectedLayersToSmallest: () => void;
  requestRender: () => void;
  activeLayerId: string | null;
  layers: UnifiedLayer[];
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  fitToObjectBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
}

export function useLayerTransformActions(options: UseLayerTransformActionsOptions) {
  const {
    selectedLayerIds,
    resizeSelectedLayersToSmallest,
    requestRender,
    activeLayerId,
    layers,
    layerCanvasesRef,
    fitToObjectBounds,
  } = options;

  const canResizeSelectedLayersToSmallest = selectedLayerIds.length > 1;
  const canObjectFit = activeLayerId !== null;

  const handleResizeSelectedLayersToSmallest = useCallback(() => {
    resizeSelectedLayersToSmallest();
    requestRender();
  }, [resizeSelectedLayersToSmallest, requestRender]);

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

  return {
    canResizeSelectedLayersToSmallest,
    canObjectFit,
    handleResizeSelectedLayersToSmallest,
    handleObjectFitToActiveLayer,
  };
}
