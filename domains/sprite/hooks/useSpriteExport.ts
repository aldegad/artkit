"use client";

import { useCallback, useRef, useState } from "react";
import { downloadBlob } from "@/shared/utils";
import { compositeAllFrames } from "../utils/compositor";
import type { SpriteTrack } from "../types";

// ============================================
// Types
// ============================================

export type SpriteExportCompression = "high" | "balanced" | "small";

export interface SpriteMp4ExportOptions {
  fps: number;
  compression: SpriteExportCompression;
  backgroundColor: string;
  loopCount: number;
}

export interface SpriteExportProgressState {
  stage: string;
  percent: number;
  detail?: string;
}

interface UseSpriteExportReturn {
  isExporting: boolean;
  exportProgress: SpriteExportProgressState | null;
  exportMp4: (
    tracks: SpriteTrack[],
    fileName: string,
    options: SpriteMp4ExportOptions,
  ) => Promise<void>;
}

// ============================================
// Helpers
// ============================================

function sanitizeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9\-_ ]+/g, "")
      .replace(/\s+/g, "-") || "untitled"
  );
}

function normalizeHexColor(input?: string): string {
  if (!input) return "#000000";
  const value = input.trim();
  const longHex = /^#([0-9a-fA-F]{6})$/;
  const shortHex = /^#([0-9a-fA-F]{3})$/;
  if (longHex.test(value)) return value.toLowerCase();
  const shortMatch = value.match(shortHex);
  if (!shortMatch) return "#000000";
  const [r, g, b] = shortMatch[1].split("");
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
}

function resolveCompression(compression: SpriteExportCompression): {
  crf: number;
  preset: "medium" | "slow";
  fallbackQ: number;
} {
  switch (compression) {
    case "high":
      return { crf: 14, preset: "slow", fallbackQ: 2 };
    case "small":
      return { crf: 24, preset: "slow", fallbackQ: 7 };
    case "balanced":
    default:
      return { crf: 18, preset: "medium", fallbackQ: 4 };
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("failed to capture canvas frame"));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

// ============================================
// Hook
// ============================================

export function useSpriteExport(): UseSpriteExportReturn {
  const ffmpegRef = useRef<import("@ffmpeg/ffmpeg").FFmpeg | null>(null);
  const ffmpegLoadingPromiseRef = useRef<Promise<
    import("@ffmpeg/ffmpeg").FFmpeg
  > | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] =
    useState<SpriteExportProgressState | null>(null);

  const getFFmpeg = useCallback(
    async (): Promise<import("@ffmpeg/ffmpeg").FFmpeg> => {
      if (ffmpegRef.current) return ffmpegRef.current;
      if (ffmpegLoadingPromiseRef.current)
        return ffmpegLoadingPromiseRef.current;

      ffmpegLoadingPromiseRef.current = (async () => {
        const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
          import("@ffmpeg/ffmpeg"),
          import("@ffmpeg/util"),
        ]);

        const ffmpeg = new FFmpeg();
        const baseURL =
          "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            "text/javascript",
          ),
          wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm",
          ),
        });

        ffmpegRef.current = ffmpeg;
        return ffmpeg;
      })();

      try {
        return await ffmpegLoadingPromiseRef.current;
      } finally {
        ffmpegLoadingPromiseRef.current = null;
      }
    },
    [],
  );

  const exportMp4 = useCallback(
    async (
      tracks: SpriteTrack[],
      fileName: string,
      options: SpriteMp4ExportOptions,
    ) => {
      if (isExporting) return;

      const { fps, compression, backgroundColor, loopCount } = options;
      const bgColor = normalizeHexColor(backgroundColor);
      const compressionSettings = resolveCompression(compression);
      const frameRate = Math.max(1, fps);
      const loops = Math.max(1, loopCount);
      const filePrefix = `export-${Date.now()}-${Math.round(Math.random() * 10000)}`;
      const outputFileName = `${filePrefix}.mp4`;
      const frameNames: string[] = [];

      try {
        setIsExporting(true);
        setExportProgress({
          stage: "Preparing export",
          percent: 2,
          detail: "Loading encoder...",
        });

        const ffmpeg = await getFFmpeg();

        // Composite all frames
        setExportProgress({
          stage: "Compositing frames",
          percent: 5,
          detail: "Merging tracks...",
        });

        const compositedFrames = await compositeAllFrames(tracks);
        if (compositedFrames.length === 0) {
          throw new Error("No frames to export");
        }

        // Determine canvas size from first frame
        const canvasWidth = compositedFrames[0].width;
        const canvasHeight = compositedFrames[0].height;

        // Ensure even dimensions for H.264
        const exportWidth = canvasWidth % 2 === 0 ? canvasWidth : canvasWidth + 1;
        const exportHeight = canvasHeight % 2 === 0 ? canvasHeight : canvasHeight + 1;

        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = exportWidth;
        exportCanvas.height = exportHeight;
        const exportCtx = exportCanvas.getContext("2d");
        if (!exportCtx) {
          throw new Error("Export canvas unavailable");
        }

        // Total frames = composited frames * loop count
        const totalFrames = compositedFrames.length * loops;

        setExportProgress({
          stage: "Capturing frames",
          percent: 8,
          detail: `0/${totalFrames}`,
        });

        // Write each frame as PNG to FFmpeg filesystem
        for (let i = 0; i < totalFrames; i++) {
          const frameIdx = i % compositedFrames.length;
          const composited = compositedFrames[frameIdx];

          // Draw background + composited frame
          exportCtx.fillStyle = bgColor;
          exportCtx.fillRect(0, 0, exportWidth, exportHeight);
          exportCtx.drawImage(composited.canvas, 0, 0);

          const frameBlob = await canvasToBlob(exportCanvas, "image/png");
          const frameName = `${filePrefix}-frame-${String(i).padStart(6, "0")}.png`;
          frameNames.push(frameName);
          await ffmpeg.writeFile(
            frameName,
            new Uint8Array(await frameBlob.arrayBuffer()),
          );

          if (i % 3 === 0 || i === totalFrames - 1) {
            const ratio = (i + 1) / totalFrames;
            const percent = 8 + ratio * 60;
            setExportProgress({
              stage: "Capturing frames",
              percent: Math.min(percent, 68),
              detail: `${i + 1}/${totalFrames}`,
            });
          }
        }

        // Encode with FFmpeg
        const encodeBase = 70;
        const encodeWeight = 28;

        const baseArgs = [
          "-framerate",
          String(frameRate),
          "-i",
          `${filePrefix}-frame-%06d.png`,
        ];

        const runEncode = async (args: string[], stage: string) => {
          const onFfmpegProgress = ({
            progress,
          }: {
            progress: number;
          }) => {
            const ratio = Math.max(0, Math.min(1, progress || 0));
            setExportProgress({
              stage,
              percent: Math.min(98, encodeBase + ratio * encodeWeight),
              detail: `${Math.round(ratio * 100)}%`,
            });
          };

          ffmpeg.on("progress", onFfmpegProgress);
          try {
            setExportProgress({
              stage,
              percent: 72,
              detail: "Starting encoder...",
            });
            const exitCode = await ffmpeg.exec(args);
            if (exitCode !== 0) {
              throw new Error(`ffmpeg exited with code ${exitCode}`);
            }
          } finally {
            ffmpeg.off("progress", onFfmpegProgress);
          }
        };

        const primaryArgs = [
          ...baseArgs,
          "-c:v",
          "libx264",
          "-preset",
          compressionSettings.preset,
          "-crf",
          String(compressionSettings.crf),
          "-tune",
          "animation",
          "-profile:v",
          "high",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          "-an",
          outputFileName,
        ];

        try {
          await runEncode(primaryArgs, "Encoding MP4");
        } catch (primaryError) {
          await ffmpeg.deleteFile(outputFileName).catch(() => {});

          const fallbackArgs = [
            ...baseArgs,
            "-c:v",
            "mpeg4",
            "-q:v",
            String(compressionSettings.fallbackQ),
            "-pix_fmt",
            "yuv420p",
            "-an",
            outputFileName,
          ];

          try {
            await runEncode(fallbackArgs, "Encoding MP4");
          } catch {
            throw primaryError;
          }
        }

        // Read and download
        const outputData = await ffmpeg.readFile(outputFileName);
        if (typeof outputData === "string") {
          throw new Error("export output was not binary data");
        }
        const outputBytes =
          outputData instanceof Uint8Array
            ? outputData
            : new Uint8Array(outputData);
        const outputCopy = new Uint8Array(outputBytes);

        downloadBlob(
          new Blob([outputCopy.buffer], { type: "video/mp4" }),
          `${sanitizeFileName(fileName)}.mp4`,
        );

        setExportProgress({
          stage: "Finalizing",
          percent: 100,
          detail: "Download ready",
        });
      } catch (error) {
        console.error("Sprite MP4 export failed:", error);
        throw error;
      } finally {
        try {
          const ffmpeg = ffmpegRef.current;
          if (ffmpeg) {
            await ffmpeg.deleteFile(outputFileName).catch(() => {});
            for (const frameName of frameNames) {
              await ffmpeg.deleteFile(frameName).catch(() => {});
            }
          }
        } catch {
          // Best-effort cleanup
        }

        setExportProgress(null);
        setIsExporting(false);
      }
    },
    [isExporting, getFFmpeg],
  );

  return {
    isExporting,
    exportProgress,
    exportMp4,
  };
}
