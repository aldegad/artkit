"use client";

import { useCallback } from "react";
import { showErrorToast, showInfoToast } from "@/shared/components";
import type { SpriteTrack } from "../types";
import {
  downloadCompositedFramesAsZip,
  downloadCompositedSpriteSheet,
  downloadLayeredTrackFramesZip,
} from "../utils/export";
import { compositeFrame } from "../utils/compositor";
import { clampExportQuality } from "../utils/exportQuality";
import type { SpriteExportSettings } from "../components/SpriteExportModal";
import type { SpriteMp4ExportOptions } from "./useSpriteExport";

export type SpriteFrameExportFormat = "png" | "webp" | "jpeg";

export interface SpriteCurrentFrameExportSettings {
  fileName: string;
  format: SpriteFrameExportFormat;
  quality: number;
  backgroundColor: string | null;
}

interface UseSpriteExportActionsOptions {
  hasRenderableFrames: boolean;
  tracks: SpriteTrack[];
  currentFrameIndex: number;
  projectName: string;
  exportFrameSize?: { width: number; height: number } | null;
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
  noFrameToExportLabel?: string;
}

interface UseSpriteExportActionsResult {
  handleExport: (settings: SpriteExportSettings) => Promise<void>;
  handleExportCurrentFrame: (settings: SpriteCurrentFrameExportSettings) => Promise<void>;
}

function getFrameExportMimeType(format: SpriteFrameExportFormat): string {
  switch (format) {
    case "webp":
      return "image/webp";
    case "jpeg":
      return "image/jpeg";
    case "png":
    default:
      return "image/png";
  }
}

function getFrameExportExtension(format: SpriteFrameExportFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export function useSpriteExportActions(
  options: UseSpriteExportActionsOptions
): UseSpriteExportActionsResult {
  const {
    hasRenderableFrames,
    tracks,
    currentFrameIndex,
    projectName,
    exportFrameSize,
    fps,
    exportMp4,
    startProgress,
    endProgress,
    closeExportModal,
    exportFailedLabel,
    noFrameToExportLabel,
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
            startProgress("Preparing layers...", 0);
            await downloadLayeredTrackFramesZip(tracks, name, {
              fps,
              frameSize: resolvedFrameSize,
              includeGuide: settings.optimizedIncludeGuide,
              format: settings.optimizedImageFormat,
              quality: settings.optimizedWebpQuality,
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

  const handleExportCurrentFrame = useCallback(async (settings: SpriteCurrentFrameExportSettings) => {
    if (!hasRenderableFrames) {
      showInfoToast(noFrameToExportLabel || "No frame available to export.");
      return;
    }

    try {
      const composited = await compositeFrame(
        tracks,
        currentFrameIndex,
        exportFrameSize ?? undefined,
        { includeDataUrl: false },
      );

      if (!composited) {
        showInfoToast(noFrameToExportLabel || "No frame available to export.");
        return;
      }

      const resolvedProjectName = projectName.trim() || "sprite-project";
      const frameNumber = currentFrameIndex + 1;
      const fallbackFileName = `${resolvedProjectName}-frame-${String(frameNumber).padStart(3, "0")}`;
      const format = settings.format ?? "png";
      const mimeType = getFrameExportMimeType(format);
      const extension = getFrameExportExtension(format);
      const finalFileName = settings.fileName.trim() || fallbackFileName;

      let exportCanvas = composited.canvas;
      if (settings.backgroundColor) {
        const flattened = document.createElement("canvas");
        flattened.width = composited.canvas.width;
        flattened.height = composited.canvas.height;
        const ctx = flattened.getContext("2d");
        if (!ctx) throw new Error("Failed to create export canvas context.");
        ctx.fillStyle = settings.backgroundColor;
        ctx.fillRect(0, 0, flattened.width, flattened.height);
        ctx.drawImage(composited.canvas, 0, 0);
        exportCanvas = flattened;
      }

      const dataUrl = format === "png"
        ? exportCanvas.toDataURL(mimeType)
        : exportCanvas.toDataURL(mimeType, clampExportQuality(settings.quality));

      const link = document.createElement("a");
      link.download = `${finalFileName}.${extension}`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Current frame export failed:", error);
      showErrorToast(`${exportFailedLabel}: ${(error as Error).message}`);
    }
  }, [
    currentFrameIndex,
    exportFailedLabel,
    exportFrameSize,
    hasRenderableFrames,
    noFrameToExportLabel,
    projectName,
    tracks,
  ]);

  return {
    handleExport,
    handleExportCurrentFrame,
  };
}
