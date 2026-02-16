"use client";

import { useCallback, type MutableRefObject, type RefObject } from "react";
import type { CropArea, Point, SelectionMask } from "../types";
import { clearSelectionFromLayer } from "../utils/selectionRegion";
import { computeMagicWandSelection } from "@/shared/utils/magicWand";

interface FloatingLayer {
  imageData: ImageData;
  x: number;
  y: number;
  originX: number;
  originY: number;
}

interface UseMagicWandSelectionActionOptions {
  editCanvasRef: RefObject<HTMLCanvasElement | null>;
  activeLayerPosition: Point | null;
  magicWandTolerance: number;
  floatingLayerRef: MutableRefObject<FloatingLayer | null>;
  setSelection: React.Dispatch<React.SetStateAction<CropArea | null>>;
  setSelectionMask: React.Dispatch<React.SetStateAction<SelectionMask | null>>;
  setIsMovingSelection: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDuplicating: React.Dispatch<React.SetStateAction<boolean>>;
}

interface UseClearSelectionPixelsActionOptions {
  selection: CropArea | null;
  selectionMask: SelectionMask | null;
  selectionFeather: number;
  editCanvasRef: RefObject<HTMLCanvasElement | null>;
  activeLayerPosition: Point | null;
  floatingLayerRef: MutableRefObject<FloatingLayer | null>;
  saveToHistory: () => void;
  requestRender: () => void;
}

export function useMagicWandSelectionAction(options: UseMagicWandSelectionActionOptions) {
  const {
    editCanvasRef,
    activeLayerPosition,
    magicWandTolerance,
    floatingLayerRef,
    setSelection,
    setSelectionMask,
    setIsMovingSelection,
    setIsDuplicating,
  } = options;

  return useCallback((imageX: number, imageY: number) => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d", { willReadFrequently: true });
    if (!editCanvas || !ctx) {
      setSelection(null);
      floatingLayerRef.current = null;
      return;
    }

    const layerPosX = activeLayerPosition?.x || 0;
    const layerPosY = activeLayerPosition?.y || 0;
    const localX = Math.floor(imageX - layerPosX);
    const localY = Math.floor(imageY - layerPosY);

    if (localX < 0 || localY < 0 || localX >= editCanvas.width || localY >= editCanvas.height) {
      setSelection(null);
      floatingLayerRef.current = null;
      return;
    }

    const imageData = ctx.getImageData(0, 0, editCanvas.width, editCanvas.height);
    const wandSelection = computeMagicWandSelection(imageData, localX, localY, {
      tolerance: magicWandTolerance,
      connectedOnly: true,
      ignoreAlpha: true,
      colorMetric: "hsv",
    });

    if (!wandSelection) {
      setSelection(null);
      floatingLayerRef.current = null;
      return;
    }

    setSelection({
      x: wandSelection.bounds.x + layerPosX,
      y: wandSelection.bounds.y + layerPosY,
      width: wandSelection.bounds.width,
      height: wandSelection.bounds.height,
    });
    setSelectionMask(null);
    setIsMovingSelection(false);
    setIsDuplicating(false);
    floatingLayerRef.current = null;
  }, [
    editCanvasRef,
    activeLayerPosition,
    magicWandTolerance,
    floatingLayerRef,
    setSelection,
    setSelectionMask,
    setIsMovingSelection,
    setIsDuplicating,
  ]);
}

export function useClearSelectionPixelsAction(options: UseClearSelectionPixelsActionOptions) {
  const {
    selection,
    selectionMask,
    selectionFeather,
    editCanvasRef,
    activeLayerPosition,
    floatingLayerRef,
    saveToHistory,
    requestRender,
  } = options;

  return useCallback(() => {
    if (!selection) return;

    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    const layerPosX = activeLayerPosition?.x || 0;
    const layerPosY = activeLayerPosition?.y || 0;

    saveToHistory();
    clearSelectionFromLayer(ctx, selection, {
      selectionMask,
      selectionFeather,
      layerOffset: { x: layerPosX, y: layerPosY },
    });
    floatingLayerRef.current = null;
    requestRender();
  }, [
    selection,
    selectionMask,
    selectionFeather,
    editCanvasRef,
    activeLayerPosition,
    floatingLayerRef,
    saveToHistory,
    requestRender,
  ]);
}
