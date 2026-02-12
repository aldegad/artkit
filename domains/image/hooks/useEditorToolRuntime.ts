"use client";

import { useCallback, useMemo } from "react";
import { CropArea, EditorToolMode, Point, UnifiedLayer } from "../types";
import { applyFeatherToImageData } from "../utils/selectionFeather";

interface UseEditorToolRuntimeOptions {
  isSpacePressed: boolean;
  toolMode: EditorToolMode;
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  editCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  brushColor: string;
  selection: CropArea | null;
  selectionFeather: number;
  saveToHistory: () => void;
}

interface UseEditorToolRuntimeReturn {
  fillWithColor: () => void;
  getActiveToolMode: () => EditorToolMode;
  activeLayerPosition: Point | null;
}

export function useEditorToolRuntime(
  options: UseEditorToolRuntimeOptions
): UseEditorToolRuntimeReturn {
  const {
    isSpacePressed,
    toolMode,
    layers,
    activeLayerId,
    editCanvasRef,
    brushColor,
    selection,
    selectionFeather,
    saveToHistory,
  } = options;

  const activeLayerPosition = useMemo(() => {
    const activeLayer = layers.find((layer) => layer.id === activeLayerId);
    return activeLayer?.position || null;
  }, [layers, activeLayerId]);

  const fillWithColor = useCallback(() => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    saveToHistory();
    ctx.fillStyle = brushColor;

    if (selection) {
      const layerPosX = activeLayerPosition?.x || 0;
      const layerPosY = activeLayerPosition?.y || 0;
      const localX = Math.round(selection.x - layerPosX);
      const localY = Math.round(selection.y - layerPosY);
      const width = Math.max(1, Math.round(selection.width));
      const height = Math.max(1, Math.round(selection.height));

      if (selectionFeather <= 0) {
        ctx.fillRect(localX, localY, width, height);
        return;
      }

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      tempCtx.fillStyle = brushColor;
      tempCtx.fillRect(0, 0, width, height);
      const feathered = applyFeatherToImageData(tempCtx.getImageData(0, 0, width, height), selectionFeather);
      tempCtx.putImageData(feathered, 0, 0);

      ctx.drawImage(tempCanvas, localX, localY);
      return;
    }

    ctx.fillRect(0, 0, editCanvas.width, editCanvas.height);
  }, [editCanvasRef, saveToHistory, brushColor, selection, selectionFeather, activeLayerPosition]);

  const getActiveToolMode = useCallback((): EditorToolMode => {
    return isSpacePressed ? "hand" : toolMode;
  }, [isSpacePressed, toolMode]);

  return {
    fillWithColor,
    getActiveToolMode,
    activeLayerPosition,
  };
}
