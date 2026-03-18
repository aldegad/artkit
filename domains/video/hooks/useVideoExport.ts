"use client";

import { useCallback, useRef, useState } from "react";
import { showErrorToast } from "@/shared/components";
import { downloadBlob } from "@/shared/utils";
import {
  type Clip,
  type MaskData,
  type PlaybackState,
  type VideoProject,
  type VideoTrack,
} from "../types";
import { createVideoExportBlob, runVideoExport } from "../utils/videoExportRunner";
import {
  sanitizeVideoExportFileName,
} from "../utils/videoExportHelpers";
import type {
  ExportProgressState,
  VideoExportOptions,
} from "../utils/videoExportTypes";

const FFMPEG_CORE_VERSION = "0.12.10";
const FFMPEG_SINGLE_THREAD_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;
const FFMPEG_MULTI_THREAD_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${FFMPEG_CORE_VERSION}/dist/umd`;
const LARGE_EXPORT_PIXEL_THRESHOLD = 6_000_000;

type FfmpegMode = "single" | "multi";

interface UseVideoExportOptions {
  project: VideoProject;
  projectName: string;
  playback: PlaybackState;
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  exportFailedLabel: string;
  onSettled?: (result: { ok: boolean; error?: string }) => void;
}

interface UseVideoExportReturn {
  isExporting: boolean;
  exportProgress: ExportProgressState | null;
  exportVideo: (
    exportFileName?: string,
    options?: VideoExportOptions
  ) => Promise<void>;
}

export type {
  ExportProgressState,
  VideoExportCompression,
  VideoExportFormat,
  VideoExportOptions,
} from "../utils/videoExportTypes";

export function useVideoExport(options: UseVideoExportOptions): UseVideoExportReturn {
  const { project, projectName, playback, clips, tracks, masksMap, exportFailedLabel, onSettled } = options;
  const ffmpegRef = useRef<Record<FfmpegMode, import("@ffmpeg/ffmpeg").FFmpeg | null>>({
    single: null,
    multi: null,
  });
  const ffmpegLoadingPromiseRef = useRef<Record<FfmpegMode, Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null>>({
    single: null,
    multi: null,
  });
  const audioBufferCacheRef = useRef<Map<string, AudioBuffer | null>>(new Map());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgressState | null>(null);

  const getPreferredFfmpegMode = useCallback((): FfmpegMode => {
    const canUseMultiThread =
      typeof window !== "undefined" &&
      window.crossOriginIsolated &&
      typeof SharedArrayBuffer !== "undefined";
    const exportPixelCount = project.canvasSize.width * project.canvasSize.height;
    const isLargeExport = exportPixelCount >= LARGE_EXPORT_PIXEL_THRESHOLD;
    return canUseMultiThread && !isLargeExport ? "multi" : "single";
  }, [project.canvasSize.height, project.canvasSize.width]);

  const getFFmpeg = useCallback(async (): Promise<import("@ffmpeg/ffmpeg").FFmpeg> => {
    const mode = getPreferredFfmpegMode();
    const existing = ffmpegRef.current[mode];
    if (existing) return existing;

    const existingPromise = ffmpegLoadingPromiseRef.current[mode];
    if (existingPromise) return existingPromise;

    ffmpegLoadingPromiseRef.current[mode] = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);

      const ffmpeg = new FFmpeg();
      const baseURL = mode === "multi"
        ? FFMPEG_MULTI_THREAD_BASE_URL
        : FFMPEG_SINGLE_THREAD_BASE_URL;

      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        ...(mode === "multi"
          ? {
              workerURL: await toBlobURL(
                `${baseURL}/ffmpeg-core.worker.js`,
                "text/javascript"
              ),
            }
          : {}),
      });

      console.info("[VideoExport] loaded ffmpeg core", {
        mode,
        canvasSize: project.canvasSize,
        pixelCount: project.canvasSize.width * project.canvasSize.height,
      });

      ffmpegRef.current[mode] = ffmpeg;
      return ffmpeg;
    })();

    try {
      return await ffmpegLoadingPromiseRef.current[mode];
    } finally {
      ffmpegLoadingPromiseRef.current[mode] = null;
    }
  }, [getPreferredFfmpegMode, project.canvasSize]);

  const exportVideo = useCallback(async (
    exportFileName?: string,
    exportOptions?: VideoExportOptions
  ) => {
    if (isExporting) return;
    let didSucceed = false;
    let failureMessage: string | undefined;

    try {
      setIsExporting(true);
      const ffmpeg = await getFFmpeg();
      const result = await runVideoExport({
        ffmpeg,
        project,
        playback,
        clips,
        tracks,
        masksMap,
        exportOptions,
        setExportProgress,
        audioBufferCache: audioBufferCacheRef.current,
      });

      downloadBlob(
        createVideoExportBlob(result),
        `${sanitizeVideoExportFileName(exportFileName || projectName)}.${result.format}`
      );
      setExportProgress({
        stage: "Finalizing",
        percent: 100,
        detail: "Download ready",
      });
      didSucceed = true;
    } catch (error) {
      console.error("Video export failed:", error);
      failureMessage = (error as Error).message;
      setExportProgress({
        stage: "Export failed",
        percent: 0,
        detail: failureMessage,
      });
      showErrorToast(`${exportFailedLabel}: ${failureMessage}`);
    } finally {
      setIsExporting(false);
      if (didSucceed) {
        setExportProgress(null);
      }
      onSettled?.({
        ok: didSucceed,
        error: failureMessage,
      });
    }
  }, [
    clips,
    exportFailedLabel,
    getFFmpeg,
    isExporting,
    masksMap,
    onSettled,
    playback,
    project,
    projectName,
    tracks,
  ]);

  return {
    isExporting,
    exportProgress,
    exportVideo,
  };
}
