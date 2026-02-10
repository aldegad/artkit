"use client";

import { useCallback, useState, type RefObject } from "react";
import { Size } from "@/shared/types";
import type { PreviewViewportAPI } from "../contexts/VideoRefsContext";
import { VideoTrack } from "../types";
import { saveMediaBlob } from "../utils/mediaStorage";

interface UseCaptureFrameToImageLayerOptions {
  previewViewportRef: RefObject<PreviewViewportAPI | null>;
  currentTime: number;
  canvasSize: Size;
  tracks: VideoTrack[];
  selectedTrackId?: string | null;
  addTrack: (name?: string, type?: "video" | "audio") => string;
  addImageClip: (
    trackId: string,
    sourceUrl: string,
    sourceSize: Size,
    startTime?: number,
    duration?: number,
    canvasSize?: Size
  ) => string;
  saveToHistory: () => void;
  selectClips: (clipIds: string[]) => void;
  clearSelectedMasks: () => void;
}

interface UseCaptureFrameToImageLayerReturn {
  isCapturingFrame: boolean;
  captureFrameToImageLayer: () => Promise<void>;
}

export function useCaptureFrameToImageLayer(
  options: UseCaptureFrameToImageLayerOptions
): UseCaptureFrameToImageLayerReturn {
  const {
    previewViewportRef,
    currentTime,
    canvasSize,
    tracks,
    selectedTrackId,
    addTrack,
    addImageClip,
    saveToHistory,
    selectClips,
    clearSelectedMasks,
  } = options;
  const [isCapturingFrame, setIsCapturingFrame] = useState(false);

  const captureFrameToImageLayer = useCallback(async () => {
    if (isCapturingFrame) return;
    const viewportApi = previewViewportRef.current;
    if (!viewportApi) return;

    setIsCapturingFrame(true);
    try {
      const captureTime = Math.max(0, currentTime);
      const frameBlob = await viewportApi.captureCompositeFrame(captureTime);
      if (!frameBlob) {
        alert("Failed to capture current frame.");
        return;
      }

      let targetVideoTrackId = selectedTrackId ?? tracks.find((track) => track.type === "video")?.id ?? null;
      if (!targetVideoTrackId) {
        targetVideoTrackId = addTrack("Video 1", "video");
      }

      const frameUrl = URL.createObjectURL(frameBlob);
      const frameSize = {
        width: canvasSize.width,
        height: canvasSize.height,
      };

      saveToHistory();
      const clipId = addImageClip(targetVideoTrackId, frameUrl, frameSize, captureTime, 5);
      try {
        await saveMediaBlob(clipId, frameBlob);
      } catch (error) {
        console.error("Failed to save captured frame blob:", error);
      }

      selectClips([clipId]);
      clearSelectedMasks();
    } catch (error) {
      console.error("Frame capture failed:", error);
      alert(`Failed to capture current frame: ${(error as Error).message}`);
    } finally {
      setIsCapturingFrame(false);
    }
  }, [
    addImageClip,
    addTrack,
    canvasSize.height,
    canvasSize.width,
    clearSelectedMasks,
    currentTime,
    isCapturingFrame,
    previewViewportRef,
    saveToHistory,
    selectClips,
    selectedTrackId,
    tracks,
  ]);

  return {
    isCapturingFrame,
    captureFrameToImageLayer,
  };
}
