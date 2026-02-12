"use client";

import { useCallback, useState } from "react";
import { showErrorToast, showInfoToast } from "@/shared/components";
import {
  interpolateFramesWithAI,
  type RifeInterpolationQuality,
} from "@/shared/ai/frameInterpolation";
import type { Clip } from "../types";
import {
  analyzeGapInterpolationSelection,
  buildGapInterpolationClips,
  captureClipBoundaryFrame,
  getGapInterpolationIssueMessage,
  VIDEO_GAP_INTERPOLATION_MAX_STEPS,
  type GapInterpolationAnalysis,
  type GapInterpolationIssue,
} from "../utils/gapInterpolation";

interface UseGapInterpolationActionsOptions {
  analysis: GapInterpolationAnalysis;
  isPlaying: boolean;
  pause: () => void;
  frameRate: number;
  quality: RifeInterpolationQuality;
  interpolationProgressLabel?: string;
  savingLabel?: string;
  failedLabel?: string;
  saveToHistory: () => void;
  addClips: (newClips: Clip[]) => void;
  selectClips: (clipIds: string[]) => void;
}

interface UseGapInterpolationActionsResult {
  showInterpolationModal: boolean;
  setShowInterpolationModal: (value: boolean) => void;
  interpolationSteps: number;
  setInterpolationSteps: (steps: number) => void;
  isInterpolatingGap: boolean;
  gapInterpolationProgress: number;
  gapInterpolationStatus: string;
  handleInterpolateClipGap: () => void;
  handleConfirmInterpolation: () => Promise<void>;
}

export type { GapInterpolationAnalysis, GapInterpolationIssue };
export { analyzeGapInterpolationSelection };

export function useGapInterpolationActions(
  options: UseGapInterpolationActionsOptions
): UseGapInterpolationActionsResult {
  const {
    analysis,
    isPlaying,
    pause,
    frameRate,
    quality,
    interpolationProgressLabel,
    savingLabel,
    failedLabel,
    saveToHistory,
    addClips,
    selectClips,
  } = options;

  const [showInterpolationModal, setShowInterpolationModal] = useState(false);
  const [interpolationSteps, setInterpolationStepsState] = useState(1);
  const [isInterpolatingGap, setIsInterpolatingGap] = useState(false);
  const [gapInterpolationProgress, setGapInterpolationProgress] = useState(0);
  const [gapInterpolationStatus, setGapInterpolationStatus] = useState("");

  const setInterpolationSteps = useCallback((steps: number) => {
    setInterpolationStepsState(Math.max(1, Math.min(VIDEO_GAP_INTERPOLATION_MAX_STEPS, Math.round(steps))));
  }, []);

  const handleInterpolateClipGap = useCallback(() => {
    if (isInterpolatingGap) return;

    if (!analysis.ready || !analysis.firstClip || !analysis.secondClip) {
      showInfoToast(getGapInterpolationIssueMessage(analysis.issue));
      return;
    }

    setInterpolationSteps(analysis.suggestedSteps);
    setShowInterpolationModal(true);
  }, [analysis, isInterpolatingGap, setInterpolationSteps]);

  const handleConfirmInterpolation = useCallback(async () => {
    if (!analysis.ready || !analysis.firstClip || !analysis.secondClip) return;

    const { firstClip, secondClip, gapDuration } = analysis;
    setShowInterpolationModal(false);

    if (isPlaying) {
      pause();
    }

    setIsInterpolatingGap(true);
    setGapInterpolationProgress(0);
    setGapInterpolationStatus(interpolationProgressLabel || "Interpolating frames");

    try {
      const [fromFrame, toFrame] = await Promise.all([
        captureClipBoundaryFrame(firstClip, "end", frameRate),
        captureClipBoundaryFrame(secondClip, "start", frameRate),
      ]);

      const outputSize = {
        width: Math.max(fromFrame.size.width, toFrame.size.width),
        height: Math.max(fromFrame.size.height, toFrame.size.height),
      };

      const generatedFrames = await interpolateFramesWithAI({
        fromImageData: fromFrame.dataUrl,
        toImageData: toFrame.dataUrl,
        steps: interpolationSteps,
        quality,
        onProgress: (progress, status) => {
          setGapInterpolationProgress(Math.max(0, Math.min(90, progress)));
          setGapInterpolationStatus(status || (interpolationProgressLabel || "Interpolating frames"));
        },
      });

      if (generatedFrames.length === 0) {
        throw new Error("No interpolation frames generated.");
      }

      setGapInterpolationProgress(92);
      setGapInterpolationStatus(savingLabel || "Saving...");
      const { createdClips, persistTasks } = await buildGapInterpolationClips({
        generatedFrames,
        firstClip,
        secondClip,
        gapDuration,
        outputSize,
      });

      saveToHistory();
      addClips(createdClips);
      selectClips(createdClips.map((clip) => clip.id));

      await Promise.all(persistTasks);

      setGapInterpolationProgress(100);
      setGapInterpolationStatus("Done");
    } catch (error) {
      console.error("Video gap interpolation failed:", error);
      setGapInterpolationStatus("Failed");
      showErrorToast(failedLabel || "Frame interpolation failed. Please try again.");
    } finally {
      setIsInterpolatingGap(false);
      window.setTimeout(() => {
        setGapInterpolationProgress(0);
        setGapInterpolationStatus("");
      }, 1500);
    }
  }, [
    analysis,
    isPlaying,
    pause,
    interpolationProgressLabel,
    savingLabel,
    failedLabel,
    frameRate,
    interpolationSteps,
    quality,
    saveToHistory,
    addClips,
    selectClips,
  ]);

  return {
    showInterpolationModal,
    setShowInterpolationModal,
    interpolationSteps,
    setInterpolationSteps,
    isInterpolatingGap,
    gapInterpolationProgress,
    gapInterpolationStatus,
    handleInterpolateClipGap,
    handleConfirmInterpolation,
  };
}
