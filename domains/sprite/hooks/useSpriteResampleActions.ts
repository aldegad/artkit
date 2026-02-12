"use client";

import { useCallback, useState } from "react";
import { confirmDialog, showErrorToast, showInfoToast } from "@/shared/components";
import { useSpriteTrackStore } from "../stores";
import type { Size, SpriteCropArea } from "../types";
import {
  clampResampleDimension,
  parseResampleInput,
  estimateCanvasSizeFromTracks,
  resampleImageDataByScale,
} from "../utils/resample";

interface UseSpriteResampleActionsOptions {
  canvasSize: Size | null;
  imageRef: React.RefObject<HTMLImageElement | null>;
  imageSize: Size;
  imageSrc: string | null;
  setCanvasSize: (size: Size | null) => void;
  setCropArea: (area: SpriteCropArea | null) => void;
  setCanvasExpandMode: (enabled: boolean) => void;
  pushHistory: () => void;
  noFramesToSaveLabel: string;
}

interface UseSpriteResampleActionsResult {
  isResampling: boolean;
  handleResampleAllResolution: () => Promise<void>;
}

export function useSpriteResampleActions(
  options: UseSpriteResampleActionsOptions
): UseSpriteResampleActionsResult {
  const {
    canvasSize,
    imageRef,
    imageSize,
    imageSrc,
    setCanvasSize,
    setCropArea,
    setCanvasExpandMode,
    pushHistory,
    noFramesToSaveLabel,
  } = options;
  const [isResampling, setIsResampling] = useState(false);

  const handleResampleAllResolution = useCallback(async () => {
    if (isResampling) return;

    const sourceTracks = useSpriteTrackStore.getState().tracks;
    const hasImageFrames = sourceTracks.some((track) =>
      track.frames.some((frame) => Boolean(frame.imageData)),
    );
    if (!hasImageFrames) {
      showInfoToast(noFramesToSaveLabel || "No frames to resample.");
      return;
    }

    const estimatedCanvasSize = await estimateCanvasSizeFromTracks(sourceTracks);
    const currentCanvasSize = canvasSize
      ? {
          width: clampResampleDimension(canvasSize.width),
          height: clampResampleDimension(canvasSize.height),
        }
      : estimatedCanvasSize ?? (
        imageSize.width > 0 && imageSize.height > 0
          ? {
              width: clampResampleDimension(imageSize.width),
              height: clampResampleDimension(imageSize.height),
            }
          : null
      );

    if (!currentCanvasSize) {
      showInfoToast("리샘플 기준 해상도를 찾지 못했습니다.");
      return;
    }

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
          message: "비율이 달라 프레임이 왜곡될 수 있습니다. 계속 진행할까요?",
          confirmLabel: "계속",
          cancelLabel: "취소",
        });
        if (!keepGoing) return;
      }

      const scaleX = nextCanvasSize.width / currentCanvasSize.width;
      const scaleY = nextCanvasSize.height / currentCanvasSize.height;
      const sourceImageDataCache = new Map<string, Promise<{ dataUrl: string; width: number; height: number }>>();

      const getResampledImageData = (dataUrl: string) => {
        const cached = sourceImageDataCache.get(dataUrl);
        if (cached) return cached;
        const promise = resampleImageDataByScale(dataUrl, scaleX, scaleY);
        sourceImageDataCache.set(dataUrl, promise);
        return promise;
      };

      const resampledTracks = await Promise.all(
        sourceTracks.map(async (track) => {
          const frames = await Promise.all(
            track.frames.map(async (frame) => {
              const offset = frame.offset ?? { x: 0, y: 0 };
              if (!frame.imageData) {
                return {
                  ...frame,
                  offset: {
                    x: Math.round(offset.x * scaleX),
                    y: Math.round(offset.y * scaleY),
                  },
                };
              }

              try {
                const resampled = await getResampledImageData(frame.imageData);
                const scaledOffset = {
                  x: Math.round(offset.x * scaleX),
                  y: Math.round(offset.y * scaleY),
                };
                return {
                  ...frame,
                  imageData: resampled.dataUrl,
                  offset: scaledOffset,
                  points: [
                    { x: scaledOffset.x, y: scaledOffset.y },
                    { x: scaledOffset.x + resampled.width, y: scaledOffset.y },
                    { x: scaledOffset.x + resampled.width, y: scaledOffset.y + resampled.height },
                    { x: scaledOffset.x, y: scaledOffset.y + resampled.height },
                  ],
                };
              } catch (error) {
                console.error("Failed to resample frame image:", error);
                return {
                  ...frame,
                  offset: {
                    x: Math.round(offset.x * scaleX),
                    y: Math.round(offset.y * scaleY),
                  },
                };
              }
            }),
          );
          return {
            ...track,
            frames,
          };
        }),
      );

      let nextImageSrc = imageSrc;
      let nextImageSize = imageSize;

      if (imageSrc) {
        try {
          const resampledSource = await resampleImageDataByScale(imageSrc, scaleX, scaleY);
          nextImageSrc = resampledSource.dataUrl;
          nextImageSize = {
            width: resampledSource.width,
            height: resampledSource.height,
          };
        } catch (error) {
          console.error("Failed to resample source image:", error);
        }
      } else if (imageSize.width > 0 && imageSize.height > 0) {
        nextImageSize = {
          width: clampResampleDimension(imageSize.width * scaleX),
          height: clampResampleDimension(imageSize.height * scaleY),
        };
      }

      pushHistory();
      useSpriteTrackStore.setState((state) => ({
        tracks: resampledTracks,
        imageSrc: nextImageSrc,
        imageSize: nextImageSize,
        currentPoints: state.currentPoints.map((point) => ({
          x: Math.round(point.x * scaleX),
          y: Math.round(point.y * scaleY),
        })),
        isPlaying: false,
      }));

      if (nextImageSrc) {
        const img = new Image();
        img.onload = () => {
          imageRef.current = img;
        };
        img.src = nextImageSrc;
      } else {
        imageRef.current = null;
      }

      setCanvasSize(nextCanvasSize);
      setCropArea(null);
      setCanvasExpandMode(false);
    } catch (error) {
      console.error("Failed to resample sprite project:", error);
      showErrorToast((error as Error).message || "전체 해상도 리샘플에 실패했습니다.");
    } finally {
      setIsResampling(false);
    }
  }, [
    canvasSize,
    imageRef,
    imageSize,
    imageSrc,
    isResampling,
    noFramesToSaveLabel,
    pushHistory,
    setCanvasExpandMode,
    setCropArea,
    setCanvasSize,
  ]);

  return {
    isResampling,
    handleResampleAllResolution,
  };
}
