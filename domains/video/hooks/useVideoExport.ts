"use client";

import { useCallback, useRef, useState } from "react";
import { downloadBlob } from "@/shared/utils";
import {
  getClipScaleX,
  getClipScaleY,
  type Clip,
  type MaskData,
  type PlaybackState,
  type VideoProject,
  type VideoTrack,
} from "../types";

export type VideoExportFormat = "mp4" | "mov";
export type VideoExportCompression = "high" | "balanced" | "small";

export interface VideoExportOptions {
  format?: VideoExportFormat;
  includeAudio?: boolean;
  compression?: VideoExportCompression;
  backgroundColor?: string;
}

export interface ExportProgressState {
  stage: string;
  percent: number;
  detail?: string;
}

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

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9-_ ]+/g, "").replace(/\s+/g, "-") || "untitled-project";
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

function resolveCompression(compression: VideoExportCompression): {
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

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
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
      quality
    );
  });
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  const channels = Array.from({ length: numChannels }, (_, index) => buffer.getChannelData(index));
  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][sampleIndex]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([wavBuffer], { type: "audio/wav" });
}

async function renderTimelineAudioBuffer(
  clips: Clip[],
  tracks: VideoTrack[],
  timelineStart: number,
  projectDuration: number
): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === "undefined" || typeof AudioContext === "undefined") {
    throw new Error("browser does not support offline audio rendering");
  }

  const duration = Math.max(projectDuration, 0.1);
  const timelineEnd = timelineStart + duration;
  const sampleRate = 44100;
  const frameCount = Math.max(1, Math.ceil(duration * sampleRate));
  const offlineContext = new OfflineAudioContext(2, frameCount, sampleRate);
  const decodeContext = new AudioContext();
  const sourceBufferCache = new Map<string, AudioBuffer | null>();
  let hasScheduledAudio = false;

  try {
    for (const clip of clips) {
      if (clip.type === "image") continue;

      const track = tracks.find((candidate) => candidate.id === clip.trackId);
      if (!track || track.muted) continue;
      if (clip.type === "video" && clip.hasAudio === false) continue;
      if (clip.audioMuted ?? false) continue;

      const clipVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
      if (clipVolume <= 0) continue;

      const clipStartTimeInTimeline = Math.max(clip.startTime, timelineStart);
      const clipEndTimeInTimeline = Math.min(clip.startTime + clip.duration, timelineEnd);
      const timelineDuration = clipEndTimeInTimeline - clipStartTimeInTimeline;
      if (timelineDuration <= 0) continue;

      let sourceBuffer = sourceBufferCache.get(clip.sourceUrl);
      if (sourceBuffer === undefined) {
        try {
          const response = await fetch(clip.sourceUrl);
          const sourceArrayBuffer = await response.arrayBuffer();
          sourceBuffer = await decodeContext.decodeAudioData(sourceArrayBuffer.slice(0));
        } catch {
          sourceBuffer = null;
        }
        sourceBufferCache.set(clip.sourceUrl, sourceBuffer);
      }

      if (!sourceBuffer) continue;

      const trimIn = Math.max(0, clip.trimIn + (clipStartTimeInTimeline - clip.startTime));
      const trimmedWindow = Math.max(0, clip.trimOut - trimIn);
      const sourceRemaining = Math.max(0, sourceBuffer.duration - trimIn);
      const playbackDuration = Math.min(
        timelineDuration,
        trimmedWindow > 0 ? trimmedWindow : timelineDuration,
        sourceRemaining
      );
      if (playbackDuration <= 0) continue;

      const sourceNode = offlineContext.createBufferSource();
      sourceNode.buffer = sourceBuffer;
      const gainNode = offlineContext.createGain();
      gainNode.gain.value = Math.max(0, Math.min(1, clipVolume / 100));

      sourceNode.connect(gainNode);
      gainNode.connect(offlineContext.destination);
      sourceNode.start(clipStartTimeInTimeline - timelineStart, trimIn, playbackDuration);
      hasScheduledAudio = true;
    }

    if (!hasScheduledAudio) return null;
    return await offlineContext.startRendering();
  } finally {
    await decodeContext.close().catch(() => {});
  }
}

async function loadExportVideoElement(sourceUrl: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = sourceUrl;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      cleanup();
      resolve(video);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

async function seekExportVideoFrame(
  video: HTMLVideoElement,
  targetTime: number,
  timeoutMs: number = 2000
): Promise<boolean> {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return false;

  const maxTime = Math.max(0, video.duration - 0.001);
  const clamped = Math.max(0, Math.min(targetTime, maxTime));
  if (Math.abs(video.currentTime - clamped) <= 0.01) return true;

  return new Promise((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(false);
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    const onSeeked = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(true);
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(false);
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });

    try {
      video.currentTime = clamped;
    } catch {
      settled = true;
      cleanup();
      resolve(false);
    }
  });
}

export function useVideoExport(options: UseVideoExportOptions): UseVideoExportReturn {
  const { project, projectName, playback, clips, tracks, masksMap, exportFailedLabel, onSettled } = options;
  const ffmpegRef = useRef<import("@ffmpeg/ffmpeg").FFmpeg | null>(null);
  const ffmpegLoadingPromiseRef = useRef<Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null>(null);
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

    const format = exportOptions?.format ?? "mp4";
    const includeAudio = exportOptions?.includeAudio ?? true;
    const compression = exportOptions?.compression ?? "balanced";
    const backgroundColor = normalizeHexColor(exportOptions?.backgroundColor);
    const compressionSettings = resolveCompression(compression);

    const fullDuration = Math.max(project.duration, 0.1);
    const rangeStart = Math.max(0, Math.min(playback.loopStart, fullDuration));
    const hasRange = playback.loopEnd > rangeStart + 0.001;
    const rangeEnd = hasRange
      ? Math.max(rangeStart + 0.001, Math.min(playback.loopEnd, fullDuration))
      : fullDuration;
    const hasCustomRange = hasRange && (rangeStart > 0.001 || rangeEnd < fullDuration - 0.001);
    const exportStart = hasCustomRange ? rangeStart : 0;
    const exportEnd = hasCustomRange ? rangeEnd : fullDuration;
    const duration = Math.max(exportEnd - exportStart, 0.1);
    const frameRate = Math.max(1, project.frameRate || 30);
    const isMov = format === "mov";
    const filePrefix = `export-${Date.now()}-${Math.round(Math.random() * 10000)}`;
    const outputFileName = `${filePrefix}.${format}`;
    const wavFileName = `${filePrefix}.wav`;
    const frameNames: string[] = [];
    const exportVideoCache = new Map<string, HTMLVideoElement>();
    let hasAudioInput = false;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = project.canvasSize.width;
    exportCanvas.height = project.canvasSize.height;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) {
      alert(`${exportFailedLabel}: export canvas unavailable`);
      return;
    }
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = "high";

    const exportImageCache = new Map<string, HTMLImageElement>();
    const exportMaskImgCache = new Map<string, HTMLImageElement>();
    const exportMaskTmpCanvas = document.createElement("canvas");
    exportMaskTmpCanvas.width = project.canvasSize.width;
    exportMaskTmpCanvas.height = project.canvasSize.height;
    const exportMaskTmpCtx = exportMaskTmpCanvas.getContext("2d");
    if (exportMaskTmpCtx) {
      exportMaskTmpCtx.imageSmoothingEnabled = true;
      exportMaskTmpCtx.imageSmoothingQuality = "high";
    }

    const getClipForExport = (trackId: string, time: number) =>
      clips.find((c) => c.trackId === trackId && time >= c.startTime && time < c.startTime + c.duration) || null;

    const getMaskForExport = (trackId: string, time: number): string | null => {
      for (const mask of masksMap.values()) {
        if (mask.trackId !== trackId) continue;
        if (time < mask.startTime || time >= mask.startTime + mask.duration) continue;
        return mask.maskData;
      }
      return null;
    };

    try {
      setIsExporting(true);
      setExportProgress({
        stage: "Preparing export",
        percent: 2,
        detail: hasCustomRange
          ? `Range ${exportStart.toFixed(2)}s - ${exportEnd.toFixed(2)}s`
          : "Loading encoder...",
      });

      const ffmpeg = await getFFmpeg();
      const totalFrames = Math.max(1, Math.ceil(duration * frameRate));
      const captureWeight = 65;
      const encodeBase = 70;
      const encodeWeight = 28;

      const imageClips = clips.filter((c) => c.type === "image");
      await Promise.all(
        imageClips.map(
          (clip) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                exportImageCache.set(clip.sourceUrl, img);
                resolve();
              };
              img.onerror = () => resolve();
              img.src = clip.sourceUrl;
            })
        )
      );

      const maskDataUrls = new Set<string>();
      for (const mask of masksMap.values()) {
        if (mask.maskData) maskDataUrls.add(mask.maskData);
      }
      await Promise.all(
        [...maskDataUrls].map(
          (data) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                exportMaskImgCache.set(data, img);
                resolve();
              };
              img.onerror = () => resolve();
              img.src = data;
            })
        )
      );

      const videoClips = clips.filter((c) => c.type === "video");
      await Promise.all(
        videoClips.map(async (clip) => {
          const video = await loadExportVideoElement(clip.sourceUrl);
          if (video) exportVideoCache.set(clip.id, video);
        })
      );

      setExportProgress({
        stage: "Capturing frames",
        percent: 4,
        detail: `0/${totalFrames}`,
      });

      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        const maxFrameTime = Math.max(exportStart, exportEnd - 0.5 / frameRate);
        const frameTime = Math.min(maxFrameTime, exportStart + frameIndex / frameRate);
        exportCtx.fillStyle = backgroundColor;
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        const sortedTracks = [...tracks].reverse();
        for (const track of sortedTracks) {
          if (!track.visible) continue;
          const clip = getClipForExport(track.id, frameTime);
          if (!clip || !clip.visible || clip.type === "audio") continue;

          let sourceEl: CanvasImageSource | null = null;
          if (clip.type === "video") {
            const video = exportVideoCache.get(clip.id);
            if (!video) continue;
            const sourceTime = clip.trimIn + (frameTime - clip.startTime);
            const seekOk = await seekExportVideoFrame(video, sourceTime);
            if (!seekOk) continue;
            sourceEl = video;
          } else if (clip.type === "image") {
            const img = exportImageCache.get(clip.sourceUrl);
            if (img && img.complete && img.naturalWidth > 0) sourceEl = img;
          }
          if (!sourceEl) continue;
          const clipScaleX = getClipScaleX(clip);
          const clipScaleY = getClipScaleY(clip);

          const maskData = getMaskForExport(clip.trackId, frameTime);
          if (maskData && exportMaskTmpCtx) {
            const maskImg = exportMaskImgCache.get(maskData);
            if (maskImg && maskImg.complete && maskImg.naturalWidth > 0) {
              exportMaskTmpCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
              exportMaskTmpCtx.globalCompositeOperation = "source-over";
              exportMaskTmpCtx.globalAlpha = 1;
              exportMaskTmpCtx.drawImage(
                sourceEl,
                clip.position.x,
                clip.position.y,
                clip.sourceSize.width * clipScaleX,
                clip.sourceSize.height * clipScaleY
              );
              exportMaskTmpCtx.globalCompositeOperation = "destination-in";
              exportMaskTmpCtx.drawImage(maskImg, 0, 0, exportCanvas.width, exportCanvas.height);
              exportMaskTmpCtx.globalCompositeOperation = "source-over";

              exportCtx.globalAlpha = clip.opacity / 100;
              exportCtx.drawImage(exportMaskTmpCanvas, 0, 0);
              exportCtx.globalAlpha = 1;
            }
          } else {
            exportCtx.globalAlpha = clip.opacity / 100;
            exportCtx.drawImage(
              sourceEl,
              clip.position.x,
              clip.position.y,
              clip.sourceSize.width * clipScaleX,
              clip.sourceSize.height * clipScaleY
            );
            exportCtx.globalAlpha = 1;
          }
        }

        const frameBlob = await canvasToBlob(exportCanvas, "image/png");
        const frameName = `${filePrefix}-frame-${String(frameIndex).padStart(6, "0")}.png`;
        frameNames.push(frameName);
        await ffmpeg.writeFile(frameName, new Uint8Array(await frameBlob.arrayBuffer()));

        if (frameIndex % 3 === 0 || frameIndex === totalFrames - 1) {
          const ratio = (frameIndex + 1) / totalFrames;
          const percent = 4 + ratio * captureWeight;
          setExportProgress({
            stage: "Capturing frames",
            percent: Math.min(percent, 69),
            detail: `${frameIndex + 1}/${totalFrames}`,
          });
        }
      }

      if (includeAudio) {
        setExportProgress({
          stage: "Rendering audio",
          percent: 70,
          detail: "Mixing timeline audio...",
        });
        const mixedAudio = await renderTimelineAudioBuffer(clips, tracks, exportStart, duration);
        if (mixedAudio) {
          const wavBlob = audioBufferToWavBlob(mixedAudio);
          await ffmpeg.writeFile(wavFileName, new Uint8Array(await wavBlob.arrayBuffer()));
          hasAudioInput = true;
        }
      }

      const baseArgs = [
        "-framerate",
        String(frameRate),
        "-i",
        `${filePrefix}-frame-%06d.png`,
      ];
      if (hasAudioInput) {
        baseArgs.push("-i", wavFileName);
      }

      const runEncode = async (args: string[], stage: string) => {
        const onFfmpegProgress = ({ progress }: { progress: number }) => {
          const ratio = Math.max(0, Math.min(1, progress || 0));
          setExportProgress({
            stage,
            percent: Math.min(98, encodeBase + (ratio * encodeWeight)),
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

      if (isMov) {
        const movAudioArgs = hasAudioInput
          ? ["-c:a", "aac", "-b:a", "256k", "-shortest"]
          : ["-an"];

        const primaryMovArgs = [
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
          ...movAudioArgs,
          outputFileName,
        ];

        try {
          await runEncode(primaryMovArgs, "Encoding MOV");
        } catch (primaryError) {
          await ffmpeg.deleteFile(outputFileName).catch(() => {});

          const fallbackMovArgs = [
            ...baseArgs,
            "-c:v",
            "mpeg4",
            "-q:v",
            String(compressionSettings.fallbackQ),
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            ...movAudioArgs,
            outputFileName,
          ];

          try {
            await runEncode(fallbackMovArgs, "Encoding MOV");
          } catch {
            throw primaryError;
          }
        }
      } else {
        const mp4AudioArgs = hasAudioInput
          ? ["-c:a", "aac", "-b:a", "192k", "-shortest"]
          : ["-an"];

        const primaryMp4Args = [
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
          ...mp4AudioArgs,
          outputFileName,
        ];

        try {
          await runEncode(primaryMp4Args, "Encoding MP4");
        } catch (primaryError) {
          await ffmpeg.deleteFile(outputFileName).catch(() => {});

          const fallbackMp4Args = [
            ...baseArgs,
            "-c:v",
            "mpeg4",
            "-q:v",
            String(compressionSettings.fallbackQ),
            "-pix_fmt",
            "yuv420p",
            ...mp4AudioArgs,
            outputFileName,
          ];

          try {
            await runEncode(fallbackMp4Args, "Encoding MP4");
          } catch {
            throw primaryError;
          }
        }
      }

      const outputData = await ffmpeg.readFile(outputFileName);
      if (typeof outputData === "string") {
        throw new Error("export output was not binary data");
      }
      const outputBytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData);
      const outputCopy = new Uint8Array(outputBytes);

      downloadBlob(
        new Blob([outputCopy.buffer], { type: isMov ? "video/quicktime" : "video/mp4" }),
        `${sanitizeFileName(exportFileName || projectName)}.${format}`
      );
      setExportProgress({
        stage: "Finalizing",
        percent: 100,
        detail: "Download ready",
      });
    } catch (error) {
      console.error("Video export failed:", error);
      alert(`${exportFailedLabel}: ${(error as Error).message}`);
    } finally {
      try {
        const ffmpeg = ffmpegRef.current;
        if (ffmpeg) {
          await ffmpeg.deleteFile(outputFileName).catch(() => {});
          if (hasAudioInput) {
            await ffmpeg.deleteFile(wavFileName).catch(() => {});
          }
          for (const frameName of frameNames) {
            await ffmpeg.deleteFile(frameName).catch(() => {});
          }
        }
      } catch {
        // Best-effort cleanup.
      }

      for (const video of exportVideoCache.values()) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }

      setExportProgress(null);
      setIsExporting(false);
      onSettled?.();
    }
  }, [
    isExporting,
    project.duration,
    project.frameRate,
    playback.loopStart,
    playback.loopEnd,
    project.canvasSize.width,
    project.canvasSize.height,
    clips,
    tracks,
    masksMap,
    projectName,
    exportFailedLabel,
    getFFmpeg,
    onSettled,
  ]);

  return {
    isExporting,
    exportProgress,
    exportVideo,
  };
}
