"use client";

import { useState, useCallback, RefObject } from "react";
import { UnifiedLayer } from "../types";
import { removeWatermark } from "../utils/watermarkRemoval";
import { showInfoToast, confirmDialog } from "@/shared/components";
import { trackEvent } from "@/shared/utils/analytics";

interface UseWatermarkRemovalOptions {
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  saveToHistory: () => void;
}

export interface UseWatermarkRemovalReturn {
  isOpen: boolean;
  isProcessing: boolean;
  progress: number;
  status: string;
  sourceCanvas: HTMLCanvasElement | null;
  openWatermarkRemoval: () => void;
  closeWatermarkRemoval: () => void;
  applyWatermarkRemoval: (maskCanvas: HTMLCanvasElement) => Promise<void>;
}

export function useWatermarkRemoval(
  options: UseWatermarkRemovalOptions
): UseWatermarkRemovalReturn {
  const { layers, activeLayerId, layerCanvasesRef, saveToHistory } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);

  const openWatermarkRemoval = useCallback(() => {
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
    setSourceCanvas(layerCanvas);
    setIsOpen(true);
  }, [activeLayerId, layers, layerCanvasesRef]);

  const closeWatermarkRemoval = useCallback(() => {
    if (isProcessing) return;
    setIsOpen(false);
    setSourceCanvas(null);
    setProgress(0);
    setStatus("");
  }, [isProcessing]);

  const applyWatermarkRemoval = useCallback(
    async (maskCanvas: HTMLCanvasElement) => {
      if (!sourceCanvas || isProcessing) return;

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

        setIsOpen(false);
        setSourceCanvas(null);
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
    [sourceCanvas, isProcessing, saveToHistory]
  );

  return {
    isOpen,
    isProcessing,
    progress,
    status,
    sourceCanvas,
    openWatermarkRemoval,
    closeWatermarkRemoval,
    applyWatermarkRemoval,
  };
}
