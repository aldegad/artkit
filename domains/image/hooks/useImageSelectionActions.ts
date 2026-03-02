"use client";

import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { CropArea, Point, SelectionMask } from "../types";
import { clearSelectionFromLayer } from "../utils/selectionRegion";
import {
  computeMagicWandColorSelection,
  toMagicWandBoundsMask,
} from "@/shared/utils/magicWand";

interface FloatingLayer {
  imageData: ImageData;
  x: number;
  y: number;
  originX: number;
  originY: number;
}

interface UseMagicWandSelectionActionOptions {
  activeLayerId: string | null;
  editCanvasRef: RefObject<HTMLCanvasElement | null>;
  activeLayerPosition: Point | null;
  magicWandTolerance: number;
  selection: CropArea | null;
  selectionMask: SelectionMask | null;
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
    activeLayerId,
    editCanvasRef,
    activeLayerPosition,
    magicWandTolerance,
    selection,
    selectionMask,
    floatingLayerRef,
    setSelection,
    setSelectionMask,
    setIsMovingSelection,
    setIsDuplicating,
  } = options;

  const magicWandSeedRef = useRef<{ x: number; y: number } | null>(null);
  const magicWandLayerIdRef = useRef<string | null>(null);
  const magicWandSelectionRef = useRef<{
    selection: CropArea;
    selectionMask: Pick<SelectionMask, "x" | "y" | "width" | "height">;
  } | null>(null);

  const clearMagicWandTracking = useCallback(() => {
    magicWandSeedRef.current = null;
    magicWandLayerIdRef.current = null;
    magicWandSelectionRef.current = null;
  }, []);

  const applyMagicWandSelectionAtSeed = useCallback((seedX: number, seedY: number) => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d", { willReadFrequently: true });
    if (!editCanvas || !ctx) {
      setSelection(null);
      setSelectionMask(null);
      floatingLayerRef.current = null;
      clearMagicWandTracking();
      return;
    }

    if (seedX < 0 || seedY < 0 || seedX >= editCanvas.width || seedY >= editCanvas.height) {
      setSelection(null);
      setSelectionMask(null);
      floatingLayerRef.current = null;
      clearMagicWandTracking();
      return;
    }

    const layerPosX = activeLayerPosition?.x || 0;
    const layerPosY = activeLayerPosition?.y || 0;
    const imageData = ctx.getImageData(0, 0, editCanvas.width, editCanvas.height);
    const wandSelection = computeMagicWandColorSelection(imageData, seedX, seedY, {
      tolerance: magicWandTolerance,
    });

    if (!wandSelection) {
      setSelection(null);
      setSelectionMask(null);
      floatingLayerRef.current = null;
      clearMagicWandTracking();
      return;
    }

    const mask = toMagicWandBoundsMask(wandSelection);
    const nextSelection: CropArea = {
      x: wandSelection.bounds.x + layerPosX,
      y: wandSelection.bounds.y + layerPosY,
      width: wandSelection.bounds.width,
      height: wandSelection.bounds.height,
    };
    const nextSelectionMask: SelectionMask = {
      x: mask.x + layerPosX,
      y: mask.y + layerPosY,
      width: mask.width,
      height: mask.height,
      mask: mask.mask,
    };

    magicWandSelectionRef.current = {
      selection: nextSelection,
      selectionMask: {
        x: nextSelectionMask.x,
        y: nextSelectionMask.y,
        width: nextSelectionMask.width,
        height: nextSelectionMask.height,
      },
    };

    setSelection(nextSelection);
    setSelectionMask(nextSelectionMask);
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
    clearMagicWandTracking,
  ]);

  useEffect(() => {
    const trackedSelection = magicWandSelectionRef.current;
    if (!trackedSelection) return;

    const matchesSelection = (
      !!selection
      && selection.x === trackedSelection.selection.x
      && selection.y === trackedSelection.selection.y
      && selection.width === trackedSelection.selection.width
      && selection.height === trackedSelection.selection.height
    );
    const matchesSelectionMask = (
      !!selectionMask
      && selectionMask.x === trackedSelection.selectionMask.x
      && selectionMask.y === trackedSelection.selectionMask.y
      && selectionMask.width === trackedSelection.selectionMask.width
      && selectionMask.height === trackedSelection.selectionMask.height
    );

    if (!matchesSelection || !matchesSelectionMask) {
      clearMagicWandTracking();
    }
  }, [selection, selectionMask, clearMagicWandTracking]);

  useEffect(() => {
    const seed = magicWandSeedRef.current;
    if (!seed) return;
    if (magicWandLayerIdRef.current !== activeLayerId) {
      clearMagicWandTracking();
      return;
    }
    applyMagicWandSelectionAtSeed(seed.x, seed.y);
  }, [activeLayerId, magicWandTolerance, applyMagicWandSelectionAtSeed, clearMagicWandTracking]);

  return useCallback((imageX: number, imageY: number) => {
    const layerPosX = activeLayerPosition?.x || 0;
    const layerPosY = activeLayerPosition?.y || 0;
    const localX = Math.floor(imageX - layerPosX);
    const localY = Math.floor(imageY - layerPosY);

    magicWandSeedRef.current = { x: localX, y: localY };
    magicWandLayerIdRef.current = activeLayerId;
    applyMagicWandSelectionAtSeed(localX, localY);
  }, [
    activeLayerId,
    activeLayerPosition,
    applyMagicWandSelectionAtSeed,
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
