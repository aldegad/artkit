"use client";

import { useCallback, useMemo, useState, Dispatch, SetStateAction } from "react";
import { SpriteFrame } from "../types";
import {
  interpolateFramesWithRife,
  type RifeInterpolationQuality,
} from "@/shared/utils/rifeInterpolation";

interface UseFrameInterpolationOptions {
  frames: SpriteFrame[];
  nextFrameId: number;
  selectedFrameIds: number[];
  setFrames: Dispatch<SetStateAction<SpriteFrame[]>>;
  setNextFrameId: (id: number | ((prev: number) => number)) => void;
  setSelectedFrameId: (id: number | null) => void;
  setSelectedFrameIds: (ids: number[]) => void;
  pushHistory: () => void;
  translations: {
    frameInterpolation?: string;
    interpolationFailed?: string;
    selectFramesForInterpolation?: string;
    frameImageNotFound?: string;
    interpolationProgress?: string;
  };
}

interface UseFrameInterpolationReturn {
  isInterpolating: boolean;
  interpolationProgress: number;
  interpolationStatus: string;
  interpolationPairCount: number;
  handleInterpolateFrames: (options: { steps: number; quality: RifeInterpolationQuality }) => Promise<void>;
}

type IndexedFrame = { frame: SpriteFrame; index: number };

function sortSelectedFrames(frames: SpriteFrame[], selectedFrameIds: number[]): IndexedFrame[] {
  const selectedIdSet = new Set(selectedFrameIds);
  return frames
    .map((frame, index) => ({ frame, index }))
    .filter(({ frame }) => selectedIdSet.has(frame.id))
    .sort((a, b) => a.index - b.index);
}

function interpolateOffset(
  from: SpriteFrame,
  to: SpriteFrame,
  t: number,
): { x: number; y: number } {
  return {
    x: Math.round(from.offset.x + (to.offset.x - from.offset.x) * t),
    y: Math.round(from.offset.y + (to.offset.y - from.offset.y) * t),
  };
}

function interpolatePoints(from: SpriteFrame, to: SpriteFrame, t: number) {
  if (from.points.length >= 3 && to.points.length >= 3 && from.points.length === to.points.length) {
    return from.points.map((point, index) => ({
      x: Math.round(point.x + (to.points[index].x - point.x) * t),
      y: Math.round(point.y + (to.points[index].y - point.y) * t),
    }));
  }

  if (from.points.length >= 3) {
    return from.points.map((point) => ({ ...point }));
  }

  if (to.points.length >= 3) {
    return to.points.map((point) => ({ ...point }));
  }

  return [];
}

export function useFrameInterpolation(
  options: UseFrameInterpolationOptions,
): UseFrameInterpolationReturn {
  const {
    frames,
    nextFrameId,
    selectedFrameIds,
    setFrames,
    setNextFrameId,
    setSelectedFrameId,
    setSelectedFrameIds,
    pushHistory,
    translations: t,
  } = options;

  const [isInterpolating, setIsInterpolating] = useState(false);
  const [interpolationProgress, setInterpolationProgress] = useState(0);
  const [interpolationStatus, setInterpolationStatus] = useState("");

  const interpolationPairCount = useMemo(() => {
    const selected = sortSelectedFrames(frames, selectedFrameIds);
    const selectedWithImage = selected.filter(({ frame }) => Boolean(frame.imageData));
    return Math.max(0, selectedWithImage.length - 1);
  }, [frames, selectedFrameIds]);

  const handleInterpolateFrames = useCallback(async (options: { steps: number; quality: RifeInterpolationQuality }) => {
    if (isInterpolating) return;

    const normalizedSteps = Math.max(1, Math.min(8, Math.floor(options.steps)));
    const quality = options.quality;
    const selectedFrames = sortSelectedFrames(frames, selectedFrameIds);

    if (selectedFrames.length < 2) {
      alert(t.selectFramesForInterpolation || "Select at least 2 frames.");
      return;
    }

    const selectedFramesWithoutImage = selectedFrames.filter(({ frame }) => !frame.imageData);
    if (selectedFramesWithoutImage.length > 0) {
      alert(t.frameImageNotFound || "One or more selected frames do not have an image.");
      return;
    }

    setIsInterpolating(true);
    setInterpolationProgress(0);
    setInterpolationStatus("Loading model...");

    try {
      pushHistory();

      const insertionsByFrameId = new Map<number, SpriteFrame[]>();
      const insertedIds: number[] = [];
      let nextId = nextFrameId;

      const totalPairs = selectedFrames.length - 1;

      for (let pairIndex = 0; pairIndex < totalPairs; pairIndex++) {
        const from = selectedFrames[pairIndex].frame;
        const to = selectedFrames[pairIndex + 1].frame;

        const generated = await interpolateFramesWithRife({
          fromImageData: from.imageData!,
          toImageData: to.imageData!,
          steps: normalizedSteps,
          quality,
          onProgress: (pairProgress, status) => {
            const globalProgress = ((pairIndex + pairProgress / 100) / totalPairs) * 100;
            setInterpolationProgress(globalProgress);
            setInterpolationStatus(
              `${t.interpolationProgress || "Interpolating"} (${pairIndex + 1}/${totalPairs}): ${status}`,
            );
          },
        });

        const generatedFrames: SpriteFrame[] = generated.map((imageData, stepIndex) => {
          const frameT = (stepIndex + 1) / (normalizedSteps + 1);
          const frame: SpriteFrame = {
            id: nextId,
            points: interpolatePoints(from, to, frameT),
            name: `${from.name || `Frame ${from.id}`} • AI ${quality === "high" ? "HQ " : ""}${stepIndex + 1}/${normalizedSteps}`,
            imageData,
            offset: interpolateOffset(from, to, frameT),
          };
          nextId += 1;
          insertedIds.push(frame.id);
          return frame;
        });

        insertionsByFrameId.set(from.id, generatedFrames);
      }

      const mergedFrames: SpriteFrame[] = [];
      for (const frame of frames) {
        mergedFrames.push(frame);
        const insertions = insertionsByFrameId.get(frame.id);
        if (insertions && insertions.length > 0) {
          mergedFrames.push(...insertions);
        }
      }

      setFrames(mergedFrames);
      setNextFrameId(nextId);

      if (insertedIds.length > 0) {
        setSelectedFrameIds(insertedIds);
        setSelectedFrameId(insertedIds[0]);
      }

      setInterpolationProgress(100);
      setInterpolationStatus("Done");
    } catch (error) {
      console.error("Frame interpolation failed:", error);
      setInterpolationStatus("Failed");
      alert(t.interpolationFailed || "Frame interpolation failed. Please try again.");
    } finally {
      setIsInterpolating(false);
      setTimeout(() => {
        setInterpolationProgress(0);
        setInterpolationStatus("");
      }, 1800);
    }
  }, [
    isInterpolating,
    frames,
    nextFrameId,
    selectedFrameIds,
    setFrames,
    setNextFrameId,
    setSelectedFrameId,
    setSelectedFrameIds,
    pushHistory,
    t,
  ]);

  return {
    isInterpolating,
    interpolationProgress,
    interpolationStatus,
    interpolationPairCount,
    handleInterpolateFrames,
  };
}
