"use client";

import { useCallback, Dispatch, SetStateAction } from "react";
import { showInfoToast } from "@/shared/components";
import { SpriteFrame } from "../types";

interface UseFrameFillOptions {
  frames: SpriteFrame[];
  selectedFrameIds: number[];
  currentFrameIndex?: number;
  getCurrentFrameIndex?: () => number;
  setFrames: Dispatch<SetStateAction<SpriteFrame[]>>;
  pushHistory: () => void;
  fillColor: string;
  frameSize?: { width: number; height: number } | null;
  translations?: {
    noFrameToFill?: string;
  };
}

interface UseFrameFillReturn {
  handleFillFrames: () => void;
}

function sanitizeFrameSize(
  size: { width: number; height: number } | null | undefined
): { width: number; height: number } {
  const widthValue = typeof size?.width === "number" && Number.isFinite(size.width) ? size.width : 1;
  const heightValue = typeof size?.height === "number" && Number.isFinite(size.height) ? size.height : 1;
  const width = Math.max(1, Math.round(widthValue));
  const height = Math.max(1, Math.round(heightValue));
  return { width, height };
}

function createSolidFrameDataUrl(
  width: number,
  height: number,
  fillColor: string
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png");
}

export function useFrameFill(options: UseFrameFillOptions): UseFrameFillReturn {
  const {
    frames,
    selectedFrameIds,
    currentFrameIndex,
    getCurrentFrameIndex,
    setFrames,
    pushHistory,
    fillColor,
    frameSize,
    translations: t,
  } = options;

  const handleFillFrames = useCallback(() => {
    const selectedIdSet = new Set(selectedFrameIds);
    const targets = selectedFrameIds.length > 0
      ? frames.filter((frame) => selectedIdSet.has(frame.id))
      : (() => {
        const resolvedIndex = getCurrentFrameIndex ? getCurrentFrameIndex() : (currentFrameIndex ?? 0);
        const frame = frames[resolvedIndex];
        return frame ? [frame] : [];
      })();

    if (targets.length === 0) {
      showInfoToast(t?.noFrameToFill || "No frame available to fill.");
      return;
    }

    const targetIdSet = new Set(targets.map((frame) => frame.id));
    const { width, height } = sanitizeFrameSize(frameSize);
    const imageData = createSolidFrameDataUrl(width, height, fillColor);
    if (!imageData) return;

    pushHistory();
    setFrames((prevFrames) =>
      prevFrames.map((frame) =>
        targetIdSet.has(frame.id)
          ? {
            ...frame,
            imageData,
            offset: { x: 0, y: 0 },
          }
          : frame
      )
    );
  }, [
    selectedFrameIds,
    frames,
    getCurrentFrameIndex,
    currentFrameIndex,
    frameSize,
    fillColor,
    pushHistory,
    setFrames,
    t,
  ]);

  return { handleFillFrames };
}
