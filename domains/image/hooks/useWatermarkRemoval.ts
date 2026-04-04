"use client";

import { useState, useCallback, type RefObject } from "react";
import { EditorToolMode, UnifiedLayer } from "../types";
import { removeWatermark } from "../utils/watermarkRemoval";
import { showInfoToast, confirmDialog } from "@/shared/components";
import { trackEvent } from "@/shared/utils/analytics";

interface UseWatermarkRemovalOptions {
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  saveToHistory: () => void;
  setToolMode: (mode: EditorToolMode) => void;
  maskCanvasRef: RefObject<HTMLCanvasElement | null>;
  initMask: (width: number, height: number) => void;
  clearMask: () => void;
}

export interface UseWatermarkRemovalReturn {
  isProcessing: boolean;
  progress: number;
  status: string;
  activateWatermarkTool: () => void;
  deactivateWatermarkTool: () => void;
  executeRemoval: () => Promise<void>;
}

export function useWatermarkRemoval(
  options: UseWatermarkRemovalOptions
): UseWatermarkRemovalReturn {
  const {
    layers,
    activeLayerId,
    layerCanvasesRef,
    saveToHistory,
    setToolMode,
    maskCanvasRef,
    initMask,
    clearMask,
  } = options;
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const activateWatermarkTool = useCallback(() => {
    const activeLayer = activeLayerId
      ? layers.find((l) => l.id === activeLayerId)
      : null;
    if (!activeLayer) {
      showInfoToast("레이어를 선택해주세요.");
      return;
    }
    const layerCanvas = layerCanvasesRef.current?.get(activeLayer.id);
    if (!layerCanvas) {
      showInfoToast("레이어 캔버스를 찾을 수 없습니다.");
      return;
    }

    initMask(layerCanvas.width, layerCanvas.height);
    setProgress(0);
    setStatus("");
    setToolMode("watermarkMask");
  }, [activeLayerId, initMask, layerCanvasesRef, layers, setToolMode]);

  const deactivateWatermarkTool = useCallback(() => {
    if (isProcessing) return;
    clearMask();
    setProgress(0);
    setStatus("");
    setToolMode("brush");
  }, [clearMask, isProcessing, setToolMode]);

  const executeRemoval = useCallback(
    async () => {
      if (isProcessing || !activeLayerId) return;

      const activeLayer = layers.find((layer) => layer.id === activeLayerId);
      if (!activeLayer) {
        showInfoToast("레이어를 선택해주세요.");
        return;
      }

      const sourceCanvas = layerCanvasesRef.current?.get(activeLayer.id);
      if (!sourceCanvas) {
        showInfoToast("레이어 캔버스를 찾을 수 없습니다.");
        return;
      }

      const maskCanvas = maskCanvasRef.current;
      if (!maskCanvas) {
        showInfoToast("마스크를 먼저 그려주세요.");
        return;
      }
      const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
      const maskData = maskCtx?.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
      const hasMaskPixels = !!maskData && (() => {
        for (let i = 3; i < maskData.length; i += 4) {
          if (maskData[i] > 0) return true;
        }
        return false;
      })();
      if (!hasMaskPixels) {
        showInfoToast("마스크를 먼저 그려주세요.");
        return;
      }

      setIsProcessing(true);
      setProgress(0);
      setStatus("초기화 중...");

      try {
        saveToHistory();

        const resultCanvas = await removeWatermark({
          sourceCanvas,
          maskCanvas,
          onProgress: (p, s) => {
            setProgress(p);
            setStatus(s);
          },
        });

        const ctx = sourceCanvas.getContext("2d")!;
        ctx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
        ctx.drawImage(resultCanvas, 0, 0);

        trackEvent("feature_use", {
          tool: "image",
          feature: "watermark_removal",
        });

        clearMask();
        setToolMode("brush");
      } catch (error) {
        console.error("Watermark removal failed:", error);
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        setStatus(`실패: ${message}`);
        void confirmDialog({
          title: "워터마크 제거에 실패했습니다.",
          message,
          confirmLabel: "닫기",
          hideCancel: true,
        });
      } finally {
        setIsProcessing(false);
        setTimeout(() => {
          setProgress(0);
          setStatus("");
        }, 2000);
      }
    },
    [
      activeLayerId,
      clearMask,
      isProcessing,
      layerCanvasesRef,
      layers,
      maskCanvasRef,
      saveToHistory,
      setToolMode,
    ]
  );

  return {
    isProcessing,
    progress,
    status,
    activateWatermarkTool,
    deactivateWatermarkTool,
    executeRemoval,
  };
}
