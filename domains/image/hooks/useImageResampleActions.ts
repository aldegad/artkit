"use client";

import { useCallback, useState } from "react";
import { confirmDialog, showErrorToast, showInfoToast } from "@/shared/components";
import type { CropArea, UnifiedLayer } from "../types";
import {
  clampResampleDimension,
  parseResampleInput,
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
  handleResampleAllResolution: () => Promise<void>;
}

export function useImageResampleActions(
  options: UseImageResampleActionsOptions
): UseImageResampleActionsReturn {
  const {
    layers,
    activeLayerId,
    canvasSize,
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

  const handleResampleAllResolution = useCallback(async () => {
    if (isResampling) return;

    if (layers.length === 0 || canvasSize.width <= 0 || canvasSize.height <= 0) {
      showInfoToast("리샘플할 레이어가 없습니다.");
      return;
    }

    const currentCanvasSize = {
      width: clampResampleDimension(canvasSize.width),
      height: clampResampleDimension(canvasSize.height),
    };

    const defaultInput = `${currentCanvasSize.width}x${currentCanvasSize.height}`;
    const input = window.prompt(
      "전체 해상도 리샘플: 새 크기를 입력하세요 (예: 512x512 또는 50%)",
      defaultInput,
    );
    if (input === null) return;

    setIsResampling(true);
    try {
      const nextCanvasSize = parseResampleInput(input, currentCanvasSize);
      if (
        nextCanvasSize.width === currentCanvasSize.width
        && nextCanvasSize.height === currentCanvasSize.height
      ) {
        return;
      }

      const currentAspect = currentCanvasSize.width / currentCanvasSize.height;
      const nextAspect = nextCanvasSize.width / nextCanvasSize.height;
      if (Math.abs(currentAspect - nextAspect) > 0.0001) {
        const keepGoing = await confirmDialog({
          title: "비율 확인",
          message: "비율이 달라 레이어가 왜곡될 수 있습니다. 계속 진행할까요?",
          confirmLabel: "계속",
          cancelLabel: "취소",
        });
        if (!keepGoing) return;
      }

      const scaleX = nextCanvasSize.width / currentCanvasSize.width;
      const scaleY = nextCanvasSize.height / currentCanvasSize.height;

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

      setCanvasSize(nextCanvasSize);
      setSelection(null);
      setCropArea(null);
      setCanvasExpandMode(false);

      const nextActiveLayerId = activeLayerId || layers[0]?.id || null;
      editCanvasRef.current = nextActiveLayerId ? sourceCanvases.get(nextActiveLayerId) || null : null;
    } catch (error) {
      console.error("Failed to resample image project:", error);
      showErrorToast((error as Error).message || "전체 해상도 리샘플에 실패했습니다.");
    } finally {
      setIsResampling(false);
    }
  }, [
    isResampling,
    layers,
    canvasSize,
    activeLayerId,
    layerCanvasesRef,
    editCanvasRef,
    saveToHistory,
    setLayers,
    setCanvasSize,
    setCropArea,
    setCanvasExpandMode,
    setSelection,
  ]);

  return {
    isResampling,
    handleResampleAllResolution,
  };
}
