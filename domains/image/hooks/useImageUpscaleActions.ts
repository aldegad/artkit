"use client";

import { useCallback, useState } from "react";
import { showErrorToast, showInfoToast } from "@/shared/components";
import type { UnifiedLayer } from "../types";
import {
  upscaleCanvas,
  getUpscaleErrorMessage,
  type UpscaleScale,
} from "@/shared/ai/upscale";
import {
  copyLayerAlphaMask,
  getLayerAlphaMask,
  clearLayerAlphaMask,
} from "@/shared/utils/layerAlphaMask";

interface UseImageUpscaleActionsOptions {
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  editCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  saveToHistory: () => void;
  setLayers: React.Dispatch<React.SetStateAction<UnifiedLayer[]>>;
}

interface UseImageUpscaleActionsReturn {
  isUpscaling: boolean;
  upscaleProgress: number;
  upscaleStatus: string;
  showUpscaleConfirm: boolean;
  upscaleScale: UpscaleScale;
  setUpscaleScale: (scale: UpscaleScale) => void;
  openUpscaleConfirm: () => void;
  closeUpscaleConfirm: () => void;
  applyUpscale: () => Promise<void>;
}

export function useImageUpscaleActions(
  options: UseImageUpscaleActionsOptions,
): UseImageUpscaleActionsReturn {
  const {
    layers,
    activeLayerId,
    layerCanvasesRef,
    editCanvasRef,
    saveToHistory,
    setLayers,
  } = options;

  const [isUpscaling, setIsUpscaling] = useState(false);
  const [upscaleProgress, setUpscaleProgress] = useState(0);
  const [upscaleStatus, setUpscaleStatus] = useState("");
  const [showUpscaleConfirmState, setShowUpscaleConfirmState] = useState(false);
  const [upscaleScale, setUpscaleScale] = useState<UpscaleScale>(2);

  const openUpscaleConfirm = useCallback(() => {
    if (layers.length === 0 || !activeLayerId) {
      showInfoToast("업스케일할 레이어가 없습니다.");
      return;
    }
    setShowUpscaleConfirmState(true);
  }, [layers.length, activeLayerId]);

  const closeUpscaleConfirm = useCallback(() => {
    if (isUpscaling) return;
    setShowUpscaleConfirmState(false);
  }, [isUpscaling]);

  const applyUpscale = useCallback(async () => {
    if (isUpscaling) return;
    if (!activeLayerId) {
      showInfoToast("업스케일할 레이어가 없습니다.");
      return;
    }

    const sourceCanvases = layerCanvasesRef.current;
    const sourceCanvas = sourceCanvases.get(activeLayerId);
    if (!sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
      showInfoToast("선택된 레이어가 비어있습니다.");
      return;
    }

    setIsUpscaling(true);
    setUpscaleProgress(0);
    setUpscaleStatus("Preparing…");

    try {
      const scale = upscaleScale;
      saveToHistory();

      const upscaled = await upscaleCanvas(sourceCanvas, {
        scale,
        onProgress: (progress, status) => {
          setUpscaleProgress(progress);
          setUpscaleStatus(status);
        },
      });

      if (getLayerAlphaMask(sourceCanvas)) {
        copyLayerAlphaMask(sourceCanvas, upscaled);
      } else {
        clearLayerAlphaMask(upscaled);
      }

      // Replace the active layer canvas
      clearLayerAlphaMask(sourceCanvas);
      sourceCanvases.set(activeLayerId, upscaled);

      // Scale the active layer's position
      setLayers((prev) =>
        prev.map((layer) => {
          if (layer.id !== activeLayerId) return layer;
          const pos = layer.position || { x: 0, y: 0 };
          const rest = { ...layer };
          delete rest.originalSize;
          return {
            ...rest,
            position: {
              x: Math.round(pos.x * scale),
              y: Math.round(pos.y * scale),
            },
          };
        }),
      );

      // Update active canvas ref
      editCanvasRef.current = upscaled;

      setShowUpscaleConfirmState(false);
      setUpscaleStatus("Done!");
    } catch (error) {
      console.error("AI upscale failed:", error);
      showErrorToast(getUpscaleErrorMessage(error));
    } finally {
      setIsUpscaling(false);
      setTimeout(() => {
        setUpscaleProgress(0);
        setUpscaleStatus("");
      }, 2000);
    }
  }, [
    isUpscaling,
    activeLayerId,
    upscaleScale,
    saveToHistory,
    layerCanvasesRef,
    setLayers,
    editCanvasRef,
  ]);

  return {
    isUpscaling,
    upscaleProgress,
    upscaleStatus,
    showUpscaleConfirm: showUpscaleConfirmState,
    upscaleScale,
    setUpscaleScale,
    openUpscaleConfirm,
    closeUpscaleConfirm,
    applyUpscale,
  };
}
