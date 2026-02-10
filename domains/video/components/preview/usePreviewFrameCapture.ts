"use client";

import { useCallback, type MutableRefObject, type RefObject } from "react";
import { Size } from "@/shared/types";
import { Clip, VideoTrack } from "../../types";
import { renderCompositeFrame } from "../../utils/compositeRenderer";

interface UsePreviewFrameCaptureOptions {
  projectSize: Size;
  currentTimeRef: MutableRefObject<number>;
  isPlaying: boolean;
  tracks: VideoTrack[];
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  getMaskAtTimeForTrack: (trackId: string, time: number) => string | null;
  videoElementsRef: RefObject<Map<string, HTMLVideoElement>>;
  imageCacheRef: MutableRefObject<Map<string, HTMLImageElement>>;
  maskImageCacheRef: MutableRefObject<Map<string, HTMLImageElement>>;
  maskTempCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  liveMaskCanvasRef: RefObject<HTMLCanvasElement | null>;
}

export function usePreviewFrameCapture({
  projectSize,
  currentTimeRef,
  isPlaying,
  tracks,
  getClipAtTime,
  getMaskAtTimeForTrack,
  videoElementsRef,
  imageCacheRef,
  maskImageCacheRef,
  maskTempCanvasRef,
  liveMaskCanvasRef,
}: UsePreviewFrameCaptureOptions) {
  return useCallback(async (time?: number): Promise<Blob | null> => {
    const width = Math.max(1, Math.round(projectSize.width));
    const height = Math.max(1, Math.round(projectSize.height));
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = width;
    captureCanvas.height = height;

    const ctx = captureCanvas.getContext("2d");
    if (!ctx) return null;

    if (!maskTempCanvasRef.current) {
      maskTempCanvasRef.current = document.createElement("canvas");
    }
    const maskTempCanvas = maskTempCanvasRef.current;
    const captureTime = Math.max(0, typeof time === "number" ? time : currentTimeRef.current);
    const maxAttempts = isPlaying ? 1 : 8;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      ctx.clearRect(0, 0, width, height);
      const fullyRendered = renderCompositeFrame(ctx, {
        time: captureTime,
        tracks,
        getClipAtTime,
        getMaskAtTimeForTrack,
        videoElements: videoElementsRef.current,
        imageCache: imageCacheRef.current,
        maskImageCache: maskImageCacheRef.current,
        maskTempCanvas,
        projectSize,
        renderRect: { x: 0, y: 0, width, height },
        liveMaskCanvas: liveMaskCanvasRef.current,
        isPlaying,
      });

      if (fullyRendered || isPlaying) {
        break;
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }

    return new Promise<Blob | null>((resolve) => {
      captureCanvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }, [
    currentTimeRef,
    getClipAtTime,
    getMaskAtTimeForTrack,
    imageCacheRef,
    isPlaying,
    liveMaskCanvasRef,
    maskImageCacheRef,
    maskTempCanvasRef,
    projectSize,
    tracks,
    videoElementsRef,
  ]);
}
