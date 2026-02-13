"use client";

import { useCallback, useState } from "react";
import { confirmDialog, showErrorToast, showInfoToast } from "@/shared/components";
import type { CropArea, UnifiedLayer } from "../types";
import {
  clampResampleDimension,
  resampleCanvasByScale,
} from "@/shared/utils/resample";
import {
  copyLayerAlphaMask,
  getLayerAlphaMask,
  clearLayerAlphaMask,
} from "@/shared/utils/layerAlphaMask";

interface UseImageResampleActionsOptions {
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  canvasSize: { width: number; height: number };
  rotation: number;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  editCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  saveToHistory: () => void;
  setLayers: React.Dispatch<React.SetStateAction<UnifiedLayer[]>>;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setCropArea: React.Dispatch<React.SetStateAction<CropArea | null>>;
  setCanvasExpandMode: React.Dispatch<React.SetStateAction<boolean>>;
  setSelection: React.Dispatch<React.SetStateAction<CropArea | null>>;
}

interface UseImageResampleActionsReturn {
  isResampling: boolean;
  isResampleModalOpen: boolean;
  resampleWidth: number;
  resampleHeight: number;
  resampleKeepAspect: boolean;
  openResampleModal: () => void;
  closeResampleModal: () => void;
  setResampleWidth: (width: number) => void;
  setResampleHeight: (height: number) => void;
  toggleResampleKeepAspect: () => void;
  applyResample: () => Promise<void>;
}

export function useImageResampleActions(
  options: UseImageResampleActionsOptions
): UseImageResampleActionsReturn {
  const {
    layers,
    activeLayerId,
    canvasSize,
    rotation,
    layerCanvasesRef,
    editCanvasRef,
    saveToHistory,
    setLayers,
    setCanvasSize,
    setCropArea,
    setCanvasExpandMode,
    setSelection,
  } = options;

  const [isResampling, setIsResampling] = useState(false);
  const [isResampleModalOpen, setIsResampleModalOpen] = useState(false);
  const [resampleWidth, setResampleWidthState] = useState(0);
  const [resampleHeight, setResampleHeightState] = useState(0);
  const [resampleKeepAspect, setResampleKeepAspect] = useState(true);
  const [resampleAspectRatio, setResampleAspectRatio] = useState(1);

  const getDisplayCanvasSize = useCallback(() => {
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const isSwapped = normalizedRotation === 90 || normalizedRotation === 270;
    const width = isSwapped ? canvasSize.height : canvasSize.width;
    const height = isSwapped ? canvasSize.width : canvasSize.height;
    return {
      width: clampResampleDimension(width),
      height: clampResampleDimension(height),
      isSwapped,
    };
  }, [canvasSize.width, canvasSize.height, rotation]);

  const openResampleModal = useCallback(() => {
    if (layers.length === 0 || canvasSize.width <= 0 || canvasSize.height <= 0) {
      showInfoToast("리샘플할 레이어가 없습니다.");
      return;
    }

    const current = getDisplayCanvasSize();
    setResampleWidthState(current.width);
    setResampleHeightState(current.height);
    setResampleKeepAspect(true);
    setResampleAspectRatio(current.width / Math.max(1, current.height));
    setIsResampleModalOpen(true);
  }, [layers.length, canvasSize.width, canvasSize.height, getDisplayCanvasSize]);

  const closeResampleModal = useCallback(() => {
    if (isResampling) return;
    setIsResampleModalOpen(false);
  }, [isResampling]);

  const setResampleWidth = useCallback((width: number) => {
    const nextWidth = clampResampleDimension(width);
    setResampleWidthState(nextWidth);

    if (!resampleKeepAspect) return;
    const syncedHeight = clampResampleDimension(nextWidth / Math.max(0.0001, resampleAspectRatio));
    setResampleHeightState(syncedHeight);
  }, [resampleKeepAspect, resampleAspectRatio]);

  const setResampleHeight = useCallback((height: number) => {
    const nextHeight = clampResampleDimension(height);
    setResampleHeightState(nextHeight);

    if (!resampleKeepAspect) return;
    const syncedWidth = clampResampleDimension(nextHeight * resampleAspectRatio);
    setResampleWidthState(syncedWidth);
  }, [resampleKeepAspect, resampleAspectRatio]);

  const toggleResampleKeepAspect = useCallback(() => {
    setResampleKeepAspect((prev) => {
      if (prev) return false;

      const nextRatio = resampleWidth / Math.max(1, resampleHeight);
      setResampleAspectRatio(nextRatio);
      return true;
    });
  }, [resampleWidth, resampleHeight]);

  const applyResample = useCallback(async () => {
    if (isResampling) return;

    const currentCanvasSize = getDisplayCanvasSize();
    const nextDisplaySize = {
      width: clampResampleDimension(resampleWidth),
      height: clampResampleDimension(resampleHeight),
    };

    if (
      nextDisplaySize.width === currentCanvasSize.width
      && nextDisplaySize.height === currentCanvasSize.height
    ) {
      setIsResampleModalOpen(false);
      return;
    }

    const currentAspect = currentCanvasSize.width / currentCanvasSize.height;
    const nextAspect = nextDisplaySize.width / nextDisplaySize.height;
    if (!resampleKeepAspect && Math.abs(currentAspect - nextAspect) > 0.0001) {
      const keepGoing = await confirmDialog({
        title: "비율 확인",
        message: "비율이 달라 레이어가 왜곡될 수 있습니다. 계속 진행할까요?",
        confirmLabel: "계속",
        cancelLabel: "취소",
      });
      if (!keepGoing) return;
    }

    setIsResampling(true);
    try {
      const scaleX = nextDisplaySize.width / currentCanvasSize.width;
      const scaleY = nextDisplaySize.height / currentCanvasSize.height;

      saveToHistory();

      const sourceCanvases = layerCanvasesRef.current;
      const nextCanvases = new Map<string, HTMLCanvasElement>();

      for (const layer of layers) {
        const sourceCanvas = sourceCanvases.get(layer.id);
        const fallbackWidth = layer.originalSize?.width || currentCanvasSize.width;
        const fallbackHeight = layer.originalSize?.height || currentCanvasSize.height;

        const resizedCanvas = sourceCanvas
          ? resampleCanvasByScale(sourceCanvas, scaleX, scaleY)
          : (() => {
              const blank = document.createElement("canvas");
              blank.width = clampResampleDimension(fallbackWidth * scaleX);
              blank.height = clampResampleDimension(fallbackHeight * scaleY);
              return blank;
            })();

        if (sourceCanvas && getLayerAlphaMask(sourceCanvas)) {
          copyLayerAlphaMask(sourceCanvas, resizedCanvas);
        } else {
          clearLayerAlphaMask(resizedCanvas);
        }

        nextCanvases.set(layer.id, resizedCanvas);
      }

      sourceCanvases.forEach((sourceCanvas) => {
        clearLayerAlphaMask(sourceCanvas);
      });
      sourceCanvases.clear();
      nextCanvases.forEach((canvas, layerId) => {
        sourceCanvases.set(layerId, canvas);
      });

      setLayers((prev) =>
        prev.map((layer) => {
          const canvas = sourceCanvases.get(layer.id);
          const sourcePosition = layer.position || { x: 0, y: 0 };
          const scaledPosition = {
            x: Math.round(sourcePosition.x * scaleX),
            y: Math.round(sourcePosition.y * scaleY),
          };

          return {
            ...layer,
            position: scaledPosition,
            originalSize: canvas
              ? {
                  width: canvas.width,
                  height: canvas.height,
                }
              : layer.originalSize,
          };
        }),
      );

      const nextStoredCanvasSize = currentCanvasSize.isSwapped
        ? { width: nextDisplaySize.height, height: nextDisplaySize.width }
        : nextDisplaySize;

      setCanvasSize(nextStoredCanvasSize);
      setSelection(null);
      setCropArea(null);
      setCanvasExpandMode(false);

      const nextActiveLayerId = activeLayerId || layers[0]?.id || null;
      editCanvasRef.current = nextActiveLayerId ? sourceCanvases.get(nextActiveLayerId) || null : null;

      setIsResampleModalOpen(false);
    } catch (error) {
      console.error("Failed to resample image project:", error);
      showErrorToast((error as Error).message || "전체 해상도 리샘플에 실패했습니다.");
    } finally {
      setIsResampling(false);
    }
  }, [
    isResampling,
    getDisplayCanvasSize,
    resampleWidth,
    resampleHeight,
    resampleKeepAspect,
    saveToHistory,
    layerCanvasesRef,
    layers,
    setLayers,
    setCanvasSize,
    setSelection,
    setCropArea,
    setCanvasExpandMode,
    activeLayerId,
    editCanvasRef,
  ]);

  return {
    isResampling,
    isResampleModalOpen,
    resampleWidth,
    resampleHeight,
    resampleKeepAspect,
    openResampleModal,
    closeResampleModal,
    setResampleWidth,
    setResampleHeight,
    toggleResampleKeepAspect,
    applyResample,
  };
}
