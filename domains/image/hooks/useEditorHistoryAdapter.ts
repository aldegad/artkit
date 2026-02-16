"use client";

import { useCallback, useMemo } from "react";
import { UnifiedLayer } from "../types";
import type { CropArea, SelectionMask } from "../types";
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
  selection: CropArea | null;
  selectionMask: SelectionMask | null;
  canvasSize: { width: number; height: number };
  canvases: LayerCanvasHistoryState[];
}

interface UseEditorHistoryAdapterOptions {
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  selectedLayerIds: string[];
  selection: CropArea | null;
  selectionMask: SelectionMask | null;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  canvasSize: { width: number; height: number };
  editCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  setLayers: React.Dispatch<React.SetStateAction<UnifiedLayer[]>>;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedLayerIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelection: React.Dispatch<React.SetStateAction<CropArea | null>>;
  setSelectionMask: React.Dispatch<React.SetStateAction<SelectionMask | null>>;
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

function cloneSelection(selection: CropArea | null): CropArea | null {
  if (!selection) return null;
  return {
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
  };
}

function cloneSelectionMask(selectionMask: SelectionMask | null): SelectionMask | null {
  if (!selectionMask) return null;
  return {
    x: selectionMask.x,
    y: selectionMask.y,
    width: selectionMask.width,
    height: selectionMask.height,
    mask: new Uint8Array(selectionMask.mask),
  };
}

export function useEditorHistoryAdapter(
  options: UseEditorHistoryAdapterOptions
): UseEditorHistoryAdapterReturn {
  const {
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
      selection: cloneSelection(selection),
      selectionMask: cloneSelectionMask(selectionMask),
      canvasSize: {
        width: canvasSize.width,
        height: canvasSize.height,
      },
      canvases,
    };
  }, [
    layers,
    activeLayerId,
    selectedLayerIds,
    selection,
    selectionMask,
    layerCanvasesRef,
    canvasSize.width,
    canvasSize.height,
  ]);

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
      setSelection(cloneSelection(snapshot.selection));
      setSelectionMask(cloneSelectionMask(snapshot.selectionMask));
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
      setSelection,
      setSelectionMask,
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
