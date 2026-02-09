"use client";

import { useCallback, useMemo } from "react";
import { CropArea, EditorToolMode, Point, UnifiedLayer } from "../types";

interface UseEditorToolRuntimeOptions {
  isSpacePressed: boolean;
  toolMode: EditorToolMode;
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  editCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  brushColor: string;
  selection: CropArea | null;
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
    saveToHistory,
  } = options;

  const fillWithColor = useCallback(() => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    saveToHistory();
    ctx.fillStyle = brushColor;

    if (selection) {
      ctx.fillRect(
        Math.round(selection.x),
        Math.round(selection.y),
        Math.round(selection.width),
        Math.round(selection.height)
      );
      return;
    }

    ctx.fillRect(0, 0, editCanvas.width, editCanvas.height);
  }, [editCanvasRef, saveToHistory, brushColor, selection]);

  const getActiveToolMode = useCallback((): EditorToolMode => {
    return isSpacePressed ? "hand" : toolMode;
  }, [isSpacePressed, toolMode]);

  const activeLayerPosition = useMemo(() => {
    const activeLayer = layers.find((layer) => layer.id === activeLayerId);
    return activeLayer?.position || null;
  }, [layers, activeLayerId]);

  return {
    fillWithColor,
    getActiveToolMode,
    activeLayerPosition,
  };
}
