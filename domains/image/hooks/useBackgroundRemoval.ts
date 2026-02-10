"use client";

import { useState, useCallback, RefObject } from "react";
import { UnifiedLayer } from "../types";
import {
  removeBackground,
  type BackgroundRemovalQuality,
} from "@/shared/ai/backgroundRemoval";

// ============================================
// Types
// ============================================

interface UseBackgroundRemovalOptions {
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  selection: { x: number; y: number; width: number; height: number } | null;
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  saveToHistory: () => void;
  quality?: BackgroundRemovalQuality;
  translations: {
    backgroundRemovalFailed?: string;
    selectLayerForBgRemoval?: string;
    layerCanvasNotFound?: string;
  };
}

interface UseBackgroundRemovalReturn {
  // State
  isRemovingBackground: boolean;
  bgRemovalProgress: number;
  bgRemovalStatus: string;
  // Handler
  handleRemoveBackground: () => Promise<void>;
}

// ============================================
// Hook Implementation
// ============================================

export function useBackgroundRemoval(
  options: UseBackgroundRemovalOptions
): UseBackgroundRemovalReturn {
  const {
    layers,
    activeLayerId,
    selection,
    layerCanvasesRef,
    saveToHistory,
    quality,
    translations: t,
  } = options;

  // State
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [bgRemovalProgress, setBgRemovalProgress] = useState(0);
  const [bgRemovalStatus, setBgRemovalStatus] = useState("");

  // Handler
  const handleRemoveBackground = useCallback(async () => {
    if (isRemovingBackground) return;

    // Get active layer
    const activeLayer = activeLayerId ? layers.find((l) => l.id === activeLayerId) : null;
    if (!activeLayer) {
      alert(t.selectLayerForBgRemoval || "Please select a layer to remove background.");
      return;
    }

    // Get layer canvas
    const layerCanvas = layerCanvasesRef.current?.get(activeLayer.id);
    if (!layerCanvas) {
      alert(t.layerCanvasNotFound || "Layer canvas not found.");
      return;
    }

    setIsRemovingBackground(true);
    setBgRemovalProgress(0);
    setBgRemovalStatus("Initializing...");

    try {
      // Save current state to history
      saveToHistory();

      let resultCanvas: HTMLCanvasElement;

      if (selection) {
        // Process only the selected area
        setBgRemovalStatus("Extracting selection...");

        // Create a canvas with the selection area
        const selectionCanvas = document.createElement("canvas");
        selectionCanvas.width = Math.round(selection.width);
        selectionCanvas.height = Math.round(selection.height);
        const selCtx = selectionCanvas.getContext("2d")!;

        // Draw the selection area from the layer canvas
        selCtx.drawImage(
          layerCanvas,
          Math.round(selection.x),
          Math.round(selection.y),
          Math.round(selection.width),
          Math.round(selection.height),
          0,
          0,
          Math.round(selection.width),
          Math.round(selection.height)
        );

        const sourceImage = selectionCanvas.toDataURL("image/png");

        // Remove background from selection
        resultCanvas = await removeBackground(
          sourceImage,
          (progress, status) => {
            setBgRemovalProgress(progress);
            setBgRemovalStatus(status);
          },
          quality ? { quality } : undefined,
        );

        // Composite the result back onto the layer canvas
        const ctx = layerCanvas.getContext("2d")!;
        // Clear the selection area
        ctx.clearRect(
          Math.round(selection.x),
          Math.round(selection.y),
          Math.round(selection.width),
          Math.round(selection.height)
        );
        // Draw the processed result
        ctx.drawImage(resultCanvas, Math.round(selection.x), Math.round(selection.y));
      } else {
        // Process the entire layer canvas
        const sourceImage = layerCanvas.toDataURL("image/png");

        resultCanvas = await removeBackground(
          sourceImage,
          (progress, status) => {
            setBgRemovalProgress(progress);
            setBgRemovalStatus(status);
          },
          quality ? { quality } : undefined,
        );

        // Replace layer canvas content with result
        const ctx = layerCanvas.getContext("2d")!;
        ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        ctx.drawImage(resultCanvas, 0, 0);
      }

      setBgRemovalStatus("Done!");
    } catch (error) {
      console.error("Background removal failed:", error);
      setBgRemovalStatus("Failed");
      alert(t.backgroundRemovalFailed || "Background removal failed. Please try again.");
    } finally {
      setIsRemovingBackground(false);
      // Clear status after a delay
      setTimeout(() => {
        setBgRemovalProgress(0);
        setBgRemovalStatus("");
      }, 2000);
    }
  }, [isRemovingBackground, layers, activeLayerId, selection, layerCanvasesRef, saveToHistory, quality, t]);

  return {
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    handleRemoveBackground,
  };
}
