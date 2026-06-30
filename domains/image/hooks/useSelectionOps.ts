"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { drawLayerWithOptionalAlphaMask } from "@/shared/utils/layerAlphaMask";
import {
  computeMagicWandSelectionFromAlphaMask,
  toMagicWandBoundsMask,
} from "@/shared/utils/magicWand";
import type { CropArea, Point, SelectionMask, UnifiedLayer } from "../types";
import { useClearSelectionPixelsAction } from "./useImageSelectionActions";

const LAYER_PIXEL_SELECTION_ALPHA_THRESHOLD = 16;

interface FloatingLayer {
  imageData: ImageData;
  x: number;
  y: number;
  originX: number;
  originY: number;
}

interface UseSelectionOpsOptions {
  selection: CropArea | null;
  selectionMask: SelectionMask | null;
  selectionFeather: number;
  editCanvasRef: RefObject<HTMLCanvasElement | null>;
  activeLayerPosition?: Point | null;
  floatingLayerRef: MutableRefObject<FloatingLayer | null>;
  saveToHistory: () => void;
  requestRender: () => void;
  getDisplayDimensions: () => { width: number; height: number };
  layers: UnifiedLayer[];
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  setSelection: Dispatch<SetStateAction<CropArea | null>>;
  setSelectionMask: Dispatch<SetStateAction<SelectionMask | null>>;
  setLassoPath: Dispatch<SetStateAction<Point[] | null>>;
  setIsMovingSelection: Dispatch<SetStateAction<boolean>>;
  setIsDuplicating: Dispatch<SetStateAction<boolean>>;
}

export function useSelectionOps(options: UseSelectionOpsOptions) {
  const {
    selection,
    selectionMask,
    selectionFeather,
    editCanvasRef,
    activeLayerPosition,
    floatingLayerRef,
    saveToHistory,
    requestRender,
    getDisplayDimensions,
    layers,
    layerCanvasesRef,
    setSelection,
    setSelectionMask,
    setLassoPath,
    setIsMovingSelection,
    setIsDuplicating,
  } = options;

  const normalizedActiveLayerPosition = activeLayerPosition ?? null;

  const clearSelectionPixels = useClearSelectionPixelsAction({
    selection,
    selectionMask,
    selectionFeather,
    editCanvasRef,
    activeLayerPosition: normalizedActiveLayerPosition,
    floatingLayerRef,
    saveToHistory,
    requestRender,
  });

  const clearSelectionState = useCallback(() => {
    setSelection(null);
    setSelectionMask(null);
    setLassoPath(null);
    setIsMovingSelection(false);
    setIsDuplicating(false);
    floatingLayerRef.current = null;
    requestRender();
  }, [
    setSelection,
    setSelectionMask,
    setLassoPath,
    setIsMovingSelection,
    setIsDuplicating,
    floatingLayerRef,
    requestRender,
  ]);

  const invertSelection = useCallback(() => {
    const { width, height } = getDisplayDimensions();
    if (width <= 0 || height <= 0) return;

    const fullMask = new Uint8Array(width * height);
    const writeMaskPixel = (x: number, y: number, alpha: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const idx = y * width + x;
      if (alpha > fullMask[idx]) {
        fullMask[idx] = alpha;
      }
    };

    if (selection) {
      if (selectionMask) {
        for (let y = 0; y < selectionMask.height; y += 1) {
          for (let x = 0; x < selectionMask.width; x += 1) {
            const alpha = selectionMask.mask[y * selectionMask.width + x];
            if (alpha <= 0) continue;
            writeMaskPixel(selectionMask.x + x, selectionMask.y + y, alpha);
          }
        }
      } else {
        const minX = Math.max(0, Math.floor(selection.x));
        const minY = Math.max(0, Math.floor(selection.y));
        const maxX = Math.min(width, Math.ceil(selection.x + selection.width));
        const maxY = Math.min(height, Math.ceil(selection.y + selection.height));
        for (let y = minY; y < maxY; y += 1) {
          for (let x = minX; x < maxX; x += 1) {
            writeMaskPixel(x, y, 255);
          }
        }
      }
    } else {
      fullMask.fill(255);
    }

    for (let i = 0; i < fullMask.length; i += 1) {
      fullMask[i] = 255 - fullMask[i];
    }

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (fullMask[y * width + x] === 0) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) {
      clearSelectionState();
      return;
    }

    const maskWidth = maxX - minX + 1;
    const maskHeight = maxY - minY + 1;
    const nextMask = new Uint8Array(maskWidth * maskHeight);
    for (let y = 0; y < maskHeight; y += 1) {
      const srcStart = (minY + y) * width + minX;
      nextMask.set(fullMask.subarray(srcStart, srcStart + maskWidth), y * maskWidth);
    }

    setSelection({
      x: minX,
      y: minY,
      width: maskWidth,
      height: maskHeight,
    });
    setSelectionMask({
      x: minX,
      y: minY,
      width: maskWidth,
      height: maskHeight,
      mask: nextMask,
    });
    setLassoPath(null);
    setIsMovingSelection(false);
    setIsDuplicating(false);
    floatingLayerRef.current = null;
    requestRender();
  }, [
    getDisplayDimensions,
    selection,
    selectionMask,
    clearSelectionState,
    setSelection,
    setSelectionMask,
    setLassoPath,
    setIsMovingSelection,
    setIsDuplicating,
    floatingLayerRef,
    requestRender,
  ]);

  const selectLayerPixelsToSelection = useCallback((layerId: string) => {
    const layer = layers.find((item) => item.id === layerId);
    const layerCanvas = layerCanvasesRef.current.get(layerId);
    if (!layer || !layerCanvas || layerCanvas.width <= 0 || layerCanvas.height <= 0) {
      clearSelectionState();
      return;
    }

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = layerCanvas.width;
    sampleCanvas.height = layerCanvas.height;
    const sampleCtx = sampleCanvas.getContext("2d");
    if (!sampleCtx) {
      clearSelectionState();
      return;
    }

    drawLayerWithOptionalAlphaMask(sampleCtx, layerCanvas, 0, 0);
    const imageData = sampleCtx.getImageData(0, 0, layerCanvas.width, layerCanvas.height);
    let seedIndex = -1;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i + 3] > LAYER_PIXEL_SELECTION_ALPHA_THRESHOLD) {
        seedIndex = i / 4;
        break;
      }
    }

    if (seedIndex < 0) {
      clearSelectionState();
      return;
    }

    const seedX = seedIndex % layerCanvas.width;
    const seedY = Math.floor(seedIndex / layerCanvas.width);
    const layerSelection = computeMagicWandSelectionFromAlphaMask(imageData, seedX, seedY, {
      alphaThreshold: LAYER_PIXEL_SELECTION_ALPHA_THRESHOLD,
      connectedOnly: false,
    });

    if (!layerSelection) {
      clearSelectionState();
      return;
    }

    const mask = toMagicWandBoundsMask(layerSelection);
    const layerPosX = layer.position?.x || 0;
    const layerPosY = layer.position?.y || 0;
    setSelection({
      x: mask.x + layerPosX,
      y: mask.y + layerPosY,
      width: mask.width,
      height: mask.height,
    });
    setSelectionMask({
      x: mask.x + layerPosX,
      y: mask.y + layerPosY,
      width: mask.width,
      height: mask.height,
      mask: mask.mask,
    });
    setLassoPath(null);
    setIsMovingSelection(false);
    setIsDuplicating(false);
    floatingLayerRef.current = null;
    requestRender();
  }, [
    layers,
    layerCanvasesRef,
    clearSelectionState,
    setSelection,
    setSelectionMask,
    setLassoPath,
    setIsMovingSelection,
    setIsDuplicating,
    floatingLayerRef,
    requestRender,
  ]);

  return {
    clearSelectionPixels,
    invertSelection,
    selectLayerPixelsToSelection,
  };
}
