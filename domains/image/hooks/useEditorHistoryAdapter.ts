"use client";

import { useCallback, useMemo } from "react";
import { UnifiedLayer } from "../types";
import { HistoryAdapter } from "./useHistory";
import {
  clearLayerAlphaMask,
  getLayerAlphaMaskImageData,
  setLayerAlphaMaskImageData,
} from "@/shared/utils/layerAlphaMask";

interface LayerCanvasHistoryState {
  layerId: string;
  width: number;
  height: number;
  imageData: ImageData;
  maskImageData: ImageData | null;
}

export interface EditorHistorySnapshot {
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  selectedLayerIds: string[];
  canvasSize: { width: number; height: number };
  canvases: LayerCanvasHistoryState[];
}

interface UseEditorHistoryAdapterOptions {
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  selectedLayerIds: string[];
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  canvasSize: { width: number; height: number };
  editCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  setLayers: React.Dispatch<React.SetStateAction<UnifiedLayer[]>>;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedLayerIds: React.Dispatch<React.SetStateAction<string[]>>;
}

interface UseEditorHistoryAdapterReturn {
  historyAdapter: HistoryAdapter<EditorHistorySnapshot>;
}

function cloneLayerForHistory(layer: UnifiedLayer): UnifiedLayer {
  return {
    ...layer,
    position: layer.position ? { ...layer.position } : undefined,
    originalSize: layer.originalSize ? { ...layer.originalSize } : undefined,
  };
}

export function useEditorHistoryAdapter(
  options: UseEditorHistoryAdapterOptions
): UseEditorHistoryAdapterReturn {
  const {
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
  } = options;

  const captureState = useCallback((): EditorHistorySnapshot => {
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
        maskImageData: getLayerAlphaMaskImageData(canvas),
      });
    }

    return {
      layers: layers.map(cloneLayerForHistory),
      activeLayerId,
      selectedLayerIds: [...selectedLayerIds],
      canvasSize: {
        width: canvasSize.width,
        height: canvasSize.height,
      },
      canvases,
    };
  }, [layers, activeLayerId, selectedLayerIds, layerCanvasesRef, canvasSize.width, canvasSize.height]);

  const applyState = useCallback(
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
        setLayerAlphaMaskImageData(canvas, canvasState.maskImageData);
        canvasMap.set(canvasState.layerId, canvas);
      });

      snapshot.layers.forEach((layer) => {
        if (canvasMap.has(layer.id)) return;

        const fallbackCanvas = document.createElement("canvas");
        fallbackCanvas.width = Math.max(1, layer.originalSize?.width || canvasSize.width || 1);
        fallbackCanvas.height = Math.max(1, layer.originalSize?.height || canvasSize.height || 1);
        clearLayerAlphaMask(fallbackCanvas);
        canvasMap.set(layer.id, fallbackCanvas);
      });

      const restoredLayers = snapshot.layers.map(cloneLayerForHistory);
      const restoredLayerIds = new Set(restoredLayers.map((layer) => layer.id));
      const nextActiveLayerId =
        snapshot.activeLayerId && restoredLayerIds.has(snapshot.activeLayerId)
          ? snapshot.activeLayerId
          : restoredLayers[0]?.id || null;

      setCanvasSize(snapshot.canvasSize);
      setLayers(restoredLayers);
      setActiveLayerId(nextActiveLayerId);
      setSelectedLayerIds(
        snapshot.selectedLayerIds.filter((layerId) => restoredLayerIds.has(layerId))
      );
      editCanvasRef.current = nextActiveLayerId ? canvasMap.get(nextActiveLayerId) || null : null;
    },
    [
      layerCanvasesRef,
      canvasSize.width,
      canvasSize.height,
      setLayers,
      setCanvasSize,
      setActiveLayerId,
      setSelectedLayerIds,
      editCanvasRef,
    ]
  );

  const historyAdapter = useMemo<HistoryAdapter<EditorHistorySnapshot>>(
    () => ({
      captureState,
      applyState,
    }),
    [captureState, applyState]
  );

  return {
    historyAdapter,
  };
}
