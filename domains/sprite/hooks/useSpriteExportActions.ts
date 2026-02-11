"use client";

import { useCallback } from "react";
import { showErrorToast } from "@/shared/components";
import type { SpriteTrack } from "../types";
import {
  downloadCompositedFramesAsZip,
  downloadCompositedSpriteSheet,
  downloadOptimizedSpriteZip,
} from "../utils/export";
import type { SpriteExportSettings } from "../components/SpriteExportModal";
import type { SpriteMp4ExportOptions } from "./useSpriteExport";

interface UseSpriteExportActionsOptions {
  hasRenderableFrames: boolean;
  tracks: SpriteTrack[];
  projectName: string;
  fps: number;
  exportMp4: (
    tracks: SpriteTrack[],
    fileName: string,
    options: SpriteMp4ExportOptions
  ) => Promise<void>;
  startProgress: (stage: string, percent: number, detail?: string) => void;
  endProgress: () => void;
  closeExportModal: () => void;
  exportFailedLabel: string;
}

interface UseSpriteExportActionsResult {
  handleExport: (settings: SpriteExportSettings) => Promise<void>;
}

export function useSpriteExportActions(
  options: UseSpriteExportActionsOptions
): UseSpriteExportActionsResult {
  const {
    hasRenderableFrames,
    tracks,
    projectName,
    fps,
    exportMp4,
    startProgress,
    endProgress,
    closeExportModal,
    exportFailedLabel,
  } = options;

  const handleExport = useCallback(async (settings: SpriteExportSettings) => {
    if (!hasRenderableFrames) return;
    const name = settings.fileName.trim() || projectName.trim() || "sprite-project";
    const resolvedFrameSize = settings.frameSize ?? undefined;
    try {
      switch (settings.exportType) {
        case "zip":
          await downloadCompositedFramesAsZip(tracks, name, {
            frameSize: resolvedFrameSize,
          });
          break;
        case "sprite-png":
          await downloadCompositedSpriteSheet(tracks, name, {
            frameSize: resolvedFrameSize,
            padding: settings.padding,
            backgroundColor: settings.bgTransparent ? undefined : settings.backgroundColor,
          });
          break;
        case "sprite-webp":
          await downloadCompositedSpriteSheet(tracks, name, {
            format: "webp",
            frameSize: resolvedFrameSize,
            padding: settings.padding,
            backgroundColor: settings.bgTransparent ? undefined : settings.backgroundColor,
            quality: settings.webpQuality,
          });
          break;
        case "mp4":
          await exportMp4(tracks, name, {
            fps: settings.mp4Fps,
            compression: settings.mp4Compression,
            backgroundColor: settings.mp4BackgroundColor,
            loopCount: settings.mp4LoopCount,
            frameSize: resolvedFrameSize,
          });
          break;
        case "optimized-zip":
          try {
            startProgress("Preparing...", 0);
            await downloadOptimizedSpriteZip(tracks, name, {
              threshold: settings.optimizedThreshold,
              target: settings.optimizedTarget,
              includeGuide: settings.optimizedIncludeGuide,
              imageFormat: settings.optimizedImageFormat,
              imageQuality: settings.optimizedWebpQuality,
              tileSize: settings.optimizedTileSize,
              fps,
              frameSize: resolvedFrameSize,
            }, (progress) => {
              startProgress(progress.stage, progress.percent, progress.detail);
            });
          } finally {
            endProgress();
          }
          break;
      }
      closeExportModal();
    } catch (error) {
      console.error("Export failed:", error);
      showErrorToast(`${exportFailedLabel}: ${(error as Error).message}`);
    }
  }, [
    closeExportModal,
    endProgress,
    exportFailedLabel,
    exportMp4,
    fps,
    hasRenderableFrames,
    projectName,
    startProgress,
    tracks,
  ]);

  return {
    handleExport,
  };
}
