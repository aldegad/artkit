"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { removeBackgroundFromCanvas } from "@/shared/ai/backgroundRemoval";
import {
  computeMagicWandSelection,
  computeMagicWandSelectionFromAlphaMask,
  createMagicWandMaskCanvas,
  type MagicWandSelection,
} from "@/shared/utils/magicWand";
import type { MagicWandSelectionMode } from "../types";

interface UseSpriteMagicWandSelectionParams {
  frameCanvasRef: RefObject<HTMLCanvasElement | null>;
  frameCtxRef: RefObject<CanvasRenderingContext2D | null>;
  mode: MagicWandSelectionMode;
  tolerance: number;
  feather: number;
  requestRender: () => void;
  getAiCacheKey: () => string | number | null;
}

interface UseSpriteMagicWandSelectionResult {
  magicWandSelectionRef: RefObject<MagicWandSelection | null>;
  magicWandMaskCanvasRef: RefObject<HTMLCanvasElement | null>;
  isAiSelecting: boolean;
  clearMagicWandSelection: () => void;
  invalidateAiSelectionCache: () => void;
  applyMagicWandSelection: (x: number, y: number) => Promise<void>;
  clearSelectedPixels: () => boolean;
  hasMagicWandSelection: () => boolean;
}

export function useSpriteMagicWandSelection({
  frameCanvasRef,
  frameCtxRef,
  mode,
  tolerance,
  feather,
  requestRender,
  getAiCacheKey,
}: UseSpriteMagicWandSelectionParams): UseSpriteMagicWandSelectionResult {
  const magicWandSelectionRef = useRef<MagicWandSelection | null>(null);
  const magicWandMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const magicWandSeedRef = useRef<{ x: number; y: number } | null>(null);
  const aiSelectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const aiSelectionCacheKeyRef = useRef<string | number | null>(null);
  const aiSelectionTaskIdRef = useRef(0);
  const [isAiSelecting, setIsAiSelecting] = useState(false);
  const currentAiCacheKey = getAiCacheKey();

  const clearMagicWandSelection = useCallback(() => {
    magicWandSelectionRef.current = null;
    magicWandMaskCanvasRef.current = null;
    magicWandSeedRef.current = null;
    requestRender();
  }, [requestRender]);

  const invalidateAiSelectionCache = useCallback(() => {
    aiSelectionCanvasRef.current = null;
    aiSelectionCacheKeyRef.current = null;
  }, []);

  useEffect(() => {
    if (aiSelectionCacheKeyRef.current === currentAiCacheKey) return;
    aiSelectionTaskIdRef.current += 1;
    setIsAiSelecting(false);
    aiSelectionCanvasRef.current = null;
    aiSelectionCacheKeyRef.current = currentAiCacheKey;
  }, [currentAiCacheKey]);

  const setSelection = useCallback((selection: MagicWandSelection | null, seed: { x: number; y: number } | null) => {
    if (!selection || !seed) {
      clearMagicWandSelection();
      return;
    }

    magicWandSeedRef.current = seed;
    magicWandSelectionRef.current = selection;
    magicWandMaskCanvasRef.current = createMagicWandMaskCanvas(selection, { feather });
    requestRender();
  }, [clearMagicWandSelection, feather, requestRender]);

  const applyMagicWandSelection = useCallback(async (x: number, y: number) => {
    const frameCtx = frameCtxRef.current;
    const frameCanvas = frameCanvasRef.current;
    if (!frameCtx || !frameCanvas) return;

    if (x < 0 || y < 0 || x >= frameCanvas.width || y >= frameCanvas.height) {
      clearMagicWandSelection();
      return;
    }

    if (mode === "ai") {
      const taskId = aiSelectionTaskIdRef.current + 1;
      aiSelectionTaskIdRef.current = taskId;
      setIsAiSelecting(true);

      try {
        const aiCacheKey = getAiCacheKey();
        let aiCanvas = aiSelectionCanvasRef.current;
        const useCachedCanvas =
          aiCanvas
          && aiSelectionCacheKeyRef.current === aiCacheKey
          && aiCanvas.width === frameCanvas.width
          && aiCanvas.height === frameCanvas.height;

        if (!useCachedCanvas) {
          aiCanvas = await removeBackgroundFromCanvas(frameCanvas);
          if (aiSelectionTaskIdRef.current !== taskId) return;
          aiSelectionCanvasRef.current = aiCanvas;
          aiSelectionCacheKeyRef.current = aiCacheKey;
        }
        if (!aiCanvas) {
          clearMagicWandSelection();
          return;
        }

        const aiCtx = aiCanvas.getContext("2d");
        if (!aiCtx) {
          clearMagicWandSelection();
          return;
        }

        const alphaImage = aiCtx.getImageData(0, 0, aiCanvas.width, aiCanvas.height);
        const selection = computeMagicWandSelectionFromAlphaMask(alphaImage, x, y, {
          connectedOnly: true,
        });
        setSelection(selection, { x, y });
      } catch (error) {
        console.error("AI selection failed:", error);
        clearMagicWandSelection();
      } finally {
        if (aiSelectionTaskIdRef.current === taskId) {
          setIsAiSelecting(false);
        }
      }
      return;
    }

    const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
    const selection = computeMagicWandSelection(imageData, x, y, {
      tolerance,
      connectedOnly: true,
      ignoreAlpha: true,
      colorMetric: "hsv",
    });
    setSelection(selection, { x, y });
  }, [clearMagicWandSelection, frameCanvasRef, frameCtxRef, getAiCacheKey, mode, setSelection, tolerance]);

  useEffect(() => {
    const seed = magicWandSeedRef.current;
    const frameCtx = frameCtxRef.current;
    const frameCanvas = frameCanvasRef.current;
    if (!seed || !frameCtx || !frameCanvas) return;

    if (seed.x < 0 || seed.y < 0 || seed.x >= frameCanvas.width || seed.y >= frameCanvas.height) {
      clearMagicWandSelection();
      return;
    }

    if (mode === "ai") {
      const aiCanvas = aiSelectionCanvasRef.current;
      if (
        !aiCanvas
        || aiCanvas.width !== frameCanvas.width
        || aiCanvas.height !== frameCanvas.height
      ) {
        clearMagicWandSelection();
        return;
      }
      const aiCtx = aiCanvas.getContext("2d");
      if (!aiCtx) {
        clearMagicWandSelection();
        return;
      }
      const alphaImage = aiCtx.getImageData(0, 0, aiCanvas.width, aiCanvas.height);
      const selection = computeMagicWandSelectionFromAlphaMask(alphaImage, seed.x, seed.y, {
        connectedOnly: true,
      });
      setSelection(selection, seed);
      return;
    }

    const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
    const selection = computeMagicWandSelection(imageData, seed.x, seed.y, {
      tolerance,
      connectedOnly: true,
      ignoreAlpha: true,
      colorMetric: "hsv",
    });
    setSelection(selection, seed);
  }, [clearMagicWandSelection, feather, frameCanvasRef, frameCtxRef, mode, setSelection, tolerance]);

  const clearSelectedPixels = useCallback(() => {
    const frameCtx = frameCtxRef.current;
    const maskCanvas = magicWandMaskCanvasRef.current;
    if (!frameCtx || !maskCanvas) return false;

    frameCtx.save();
    frameCtx.globalCompositeOperation = "destination-out";
    frameCtx.drawImage(maskCanvas, 0, 0);
    frameCtx.restore();
    invalidateAiSelectionCache();
    return true;
  }, [frameCtxRef, invalidateAiSelectionCache]);

  const hasMagicWandSelection = useCallback(
    () => Boolean(magicWandSelectionRef.current && magicWandMaskCanvasRef.current),
    [],
  );

  return {
    magicWandSelectionRef,
    magicWandMaskCanvasRef,
    isAiSelecting,
    clearMagicWandSelection,
    invalidateAiSelectionCache,
    applyMagicWandSelection,
    clearSelectedPixels,
    hasMagicWandSelection,
  };
}
