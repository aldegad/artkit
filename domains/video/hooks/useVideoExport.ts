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

interface UseVideoExportOptions {
  project: VideoProject;
  projectName: string;
  playback: PlaybackState;
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  exportFailedLabel: string;
  onSettled?: () => void;
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
  const ffmpegRef = useRef<import("@ffmpeg/ffmpeg").FFmpeg | null>(null);
  const ffmpegLoadingPromiseRef = useRef<Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null>(null);
  const audioBufferCacheRef = useRef<Map<string, AudioBuffer | null>>(new Map());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgressState | null>(null);

  const getFFmpeg = useCallback(async (): Promise<import("@ffmpeg/ffmpeg").FFmpeg> => {
    if (ffmpegRef.current) return ffmpegRef.current;
    if (ffmpegLoadingPromiseRef.current) return ffmpegLoadingPromiseRef.current;

    ffmpegLoadingPromiseRef.current = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);

      const ffmpeg = new FFmpeg();
      const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      ffmpegRef.current = ffmpeg;
      return ffmpeg;
    })();

    try {
      return await ffmpegLoadingPromiseRef.current;
    } finally {
      ffmpegLoadingPromiseRef.current = null;
    }
  }, []);

  const exportVideo = useCallback(async (
    exportFileName?: string,
    exportOptions?: VideoExportOptions
  ) => {
    if (isExporting) return;

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
    } catch (error) {
      console.error("Video export failed:", error);
      showErrorToast(`${exportFailedLabel}: ${(error as Error).message}`);
    } finally {
      setExportProgress(null);
      setIsExporting(false);
      onSettled?.();
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
