"use client";

import { useCallback, useRef, useState } from "react";
import { showErrorToast } from "@/shared/components";
import { downloadBlob } from "@/shared/utils";
import { trackEvent } from "@/shared/utils/analytics";
import {
  getClipScaleX,
  getClipScaleY,
  getClipPlaybackSpeed,
  getSourceDurationForTimelineDuration,
  getSourceTime,
  type Clip,
  type MaskData,
  type PlaybackState,
  type VideoProject,
  type VideoClip,
  type VideoTrack,
} from "../types";
import { resolveClipPositionAtTimelineTime } from "../utils/clipTransformKeyframes";
import { loadMediaBlob } from "../utils/mediaStorage";

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

interface TrackRenderEntry {
  clip: Clip;
}

interface TimedTrackMask {
  startTime: number;
  endTime: number;
  maskData: string;
}

interface DirectVideoExportPlan {
  clip: VideoClip;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  sourceStart: number;
  sourceDuration: number;
  includeAudio: boolean;
  audioVolume: number;
}

const EXPORT_EPSILON = 1e-3;

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

function findActiveClipAtTime(trackClips: Clip[], time: number): Clip | null {
  if (trackClips.length === 0) return null;

  let lo = 0;
  let hi = trackClips.length - 1;
  let candidate = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (trackClips[mid].startTime <= time) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (candidate < 0) return null;

  for (let index = candidate; index >= 0; index -= 1) {
    const clip = trackClips[index];
    if (clip.startTime + clip.duration <= time) break;
    if (time >= clip.startTime && time < clip.startTime + clip.duration) {
      return clip;
    }
  }

  return null;
}

function findActiveMaskAtTime(trackMasks: TimedTrackMask[], time: number): string | null {
  if (trackMasks.length === 0) return null;

  let lo = 0;
  let hi = trackMasks.length - 1;
  let candidate = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (trackMasks[mid].startTime <= time) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (candidate < 0) return null;

  for (let index = candidate; index >= 0; index -= 1) {
    const mask = trackMasks[index];
    if (mask.endTime <= time) break;
    if (time >= mask.startTime && time < mask.endTime) {
      return mask.maskData;
    }
  }

  return null;
}

function resolveSourceExtension(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("webm")) return "webm";
  if (lower.includes("quicktime") || lower.includes("mov")) return "mov";
  if (lower.includes("ogg")) return "ogv";
  return "mp4";
}

function roundIfNearInteger(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return Math.abs(value - rounded) <= EXPORT_EPSILON ? rounded : null;
}

function buildAtempoFilters(playbackSpeed: number): string[] {
  const filters: string[] = [];
  let remaining = playbackSpeed;

  while (remaining > 2 + EXPORT_EPSILON) {
    filters.push("atempo=2");
    remaining /= 2;
  }

  while (remaining < 0.5 - EXPORT_EPSILON) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }

  if (Math.abs(remaining - 1) > EXPORT_EPSILON) {
    filters.push(`atempo=${remaining.toFixed(6)}`);
  }

  return filters;
}

function resolveDirectVideoExportPlan(params: {
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  project: VideoProject;
  exportStart: number;
  exportEnd: number;
  includeAudio: boolean;
}): DirectVideoExportPlan | null {
  const { clips, tracks, masksMap, project, exportStart, exportEnd, includeAudio } = params;
  if (clips.length !== 1) return null;

  const clip = clips[0];
  if (clip.type !== "video" || !clip.visible) return null;

  const track = tracks.find((candidate) => candidate.id === clip.trackId);
  if (!track || !track.visible) return null;

  const hasMask = Array.from(masksMap.values()).some((mask) => Boolean(mask.maskData));
  if (hasMask) return null;

  if ((clip.transformKeyframes?.position?.length ?? 0) > 0) return null;
  if (Math.abs(clip.rotation) > EXPORT_EPSILON) return null;
  if (Math.abs(clip.opacity - 100) > EXPORT_EPSILON) return null;

  const scaleX = getClipScaleX(clip);
  const scaleY = getClipScaleY(clip);
  if (Math.abs(scaleX - 1) > EXPORT_EPSILON || Math.abs(scaleY - 1) > EXPORT_EPSILON) {
    return null;
  }

  const clipEnd = clip.startTime + clip.duration;
  if (exportStart < clip.startTime - EXPORT_EPSILON || exportEnd > clipEnd + EXPORT_EPSILON) {
    return null;
  }

  const cropX = roundIfNearInteger(-clip.position.x);
  const cropY = roundIfNearInteger(-clip.position.y);
  const cropWidth = roundIfNearInteger(project.canvasSize.width);
  const cropHeight = roundIfNearInteger(project.canvasSize.height);
  if (
    cropX === null ||
    cropY === null ||
    cropWidth === null ||
    cropHeight === null ||
    cropX < 0 ||
    cropY < 0 ||
    cropWidth <= 0 ||
    cropHeight <= 0
  ) {
    return null;
  }

  if (cropX + cropWidth > clip.sourceSize.width || cropY + cropHeight > clip.sourceSize.height) {
    return null;
  }

  const sourceStart = getSourceTime(clip, exportStart);
  const sourceDuration = getSourceDurationForTimelineDuration(clip, exportEnd - exportStart);
  if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    return null;
  }

  const audioVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;

  return {
    clip,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    sourceStart,
    sourceDuration,
    includeAudio:
      includeAudio &&
      clip.hasAudio !== false &&
      !(clip.audioMuted ?? false) &&
      audioVolume > 0,
    audioVolume,
  };
}

async function renderTimelineAudioBuffer(
  clips: Clip[],
  tracks: VideoTrack[],
  timelineStart: number,
  projectDuration: number,
  sourceBufferCache: Map<string, AudioBuffer | null>
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

      const clipSpeed = getClipPlaybackSpeed(clip);
      const trimIn = getSourceTime(clip, clipStartTimeInTimeline);
      const trimmedWindow = Math.max(0, clip.trimOut - trimIn);
      const sourceRemaining = Math.max(0, sourceBuffer.duration - trimIn);
      const playbackDuration = Math.min(
        getSourceDurationForTimelineDuration(clip, timelineDuration),
        trimmedWindow > 0
          ? trimmedWindow
          : getSourceDurationForTimelineDuration(clip, timelineDuration),
        sourceRemaining
      );
      if (playbackDuration <= 0) continue;

      const sourceNode = offlineContext.createBufferSource();
      sourceNode.buffer = sourceBuffer;
      sourceNode.playbackRate.value = clipSpeed;
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

function getContainerAudioArgs(
  format: VideoExportFormat,
  hasAudioInput: boolean
): string[] {
  if (!hasAudioInput) return ["-an"];
  return format === "mov"
    ? ["-c:a", "aac", "-b:a", "256k", "-shortest"]
    : ["-c:a", "aac", "-b:a", "192k", "-shortest"];
}

function buildEncodeArgs(params: {
  format: VideoExportFormat;
  baseArgs: string[];
  compressionSettings: ReturnType<typeof resolveCompression>;
  hasAudioInput: boolean;
  outputFileName: string;
  fallback?: boolean;
}): string[] {
  const { format, baseArgs, compressionSettings, hasAudioInput, outputFileName, fallback = false } = params;
  const audioArgs = getContainerAudioArgs(format, hasAudioInput);

  if (fallback) {
    return [
      ...baseArgs,
      "-c:v",
      "mpeg4",
      "-q:v",
      String(compressionSettings.fallbackQ),
      "-pix_fmt",
      "yuv420p",
      ...(format === "mov" ? ["-movflags", "+faststart"] : []),
      ...audioArgs,
      outputFileName,
    ];
  }

  return [
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
    ...(format === "mov" || format === "mp4" ? ["-movflags", "+faststart"] : []),
    ...audioArgs,
    outputFileName,
  ];
}

async function runEncodeWithProgress(params: {
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg;
  args: string[];
  stage: string;
  encodeBase: number;
  encodeWeight: number;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<void> {
  const { ffmpeg, args, stage, encodeBase, encodeWeight, setExportProgress } = params;
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
}

async function encodeOutputFile(params: {
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg;
  format: VideoExportFormat;
  baseArgs: string[];
  compressionSettings: ReturnType<typeof resolveCompression>;
  hasAudioInput: boolean;
  outputFileName: string;
  encodeBase: number;
  encodeWeight: number;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<void> {
  const {
    ffmpeg,
    format,
    baseArgs,
    compressionSettings,
    hasAudioInput,
    outputFileName,
    encodeBase,
    encodeWeight,
    setExportProgress,
  } = params;
  const stage = `Encoding ${format.toUpperCase()}`;
  const primaryArgs = buildEncodeArgs({
    format,
    baseArgs,
    compressionSettings,
    hasAudioInput,
    outputFileName,
  });

  try {
    await runEncodeWithProgress({
      ffmpeg,
      args: primaryArgs,
      stage,
      encodeBase,
      encodeWeight,
      setExportProgress,
    });
  } catch (primaryError) {
    await ffmpeg.deleteFile(outputFileName).catch(() => {});
    const fallbackArgs = buildEncodeArgs({
      format,
      baseArgs,
      compressionSettings,
      hasAudioInput,
      outputFileName,
      fallback: true,
    });

    try {
      await runEncodeWithProgress({
        ffmpeg,
        args: fallbackArgs,
        stage,
        encodeBase,
        encodeWeight,
        setExportProgress,
      });
    } catch {
      throw primaryError;
    }
  }
}

async function writeBlobToFfmpegFile(
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg,
  fileName: string,
  blob: Blob
): Promise<void> {
  await ffmpeg.writeFile(fileName, new Uint8Array(await blob.arrayBuffer()));
}

async function readBinaryOutputFile(
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg,
  fileName: string
): Promise<Uint8Array> {
  const outputData = await ffmpeg.readFile(fileName);
  if (typeof outputData === "string") {
    throw new Error("export output was not binary data");
  }
  const outputBytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData);
  return new Uint8Array(outputBytes);
}

function cloneToArrayBuffer(data: Uint8Array): ArrayBuffer {
  const cloned = new Uint8Array(data.byteLength);
  cloned.set(data);
  return cloned.buffer;
}

async function resolveClipSourceBlob(clip: VideoClip): Promise<Blob> {
  const shouldTrySourceUrlFirst =
    clip.sourceUrl.startsWith("blob:") ||
    clip.sourceUrl.startsWith("data:") ||
    /^https?:/i.test(clip.sourceUrl);

  if (shouldTrySourceUrlFirst) {
    try {
      const response = await fetch(clip.sourceUrl);
      if (response.ok) {
        return await response.blob();
      }
    } catch {
      // Fall through to persisted media lookup.
    }
  }

  const storedBlob = await loadMediaBlob(clip.id).catch(() => null);
  if (storedBlob) {
    return storedBlob;
  }

  const response = await fetch(clip.sourceUrl);
  if (!response.ok) {
    throw new Error(`failed to load source media (${response.status})`);
  }
  return response.blob();
}

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
    const cleanupFileNames: string[] = [outputFileName];
    const exportVideoCache = new Map<string, HTMLVideoElement>();
    let hasAudioInput = false;

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

      const directPlan = resolveDirectVideoExportPlan({
        clips,
        tracks,
        masksMap,
        project,
        exportStart,
        exportEnd,
        includeAudio,
      });

      if (directPlan) {
        setExportProgress({
          stage: "Preparing direct export",
          percent: 8,
          detail: "Loading source media...",
        });

        const sourceBlob = await resolveClipSourceBlob(directPlan.clip);
        const sourceFileName = `${filePrefix}-source.${resolveSourceExtension(
          sourceBlob.type || directPlan.clip.sourceUrl
        )}`;
        cleanupFileNames.push(sourceFileName);
        await writeBlobToFfmpegFile(ffmpeg, sourceFileName, sourceBlob);

        const videoFilters = [
          `trim=start=${directPlan.sourceStart.toFixed(6)}:duration=${directPlan.sourceDuration.toFixed(6)}`,
          `setpts=(PTS-STARTPTS)/${getClipPlaybackSpeed(directPlan.clip).toFixed(6)}`,
        ];
        const needsCrop =
          directPlan.cropX !== 0 ||
          directPlan.cropY !== 0 ||
          directPlan.cropWidth !== directPlan.clip.sourceSize.width ||
          directPlan.cropHeight !== directPlan.clip.sourceSize.height;
        if (needsCrop) {
          videoFilters.push(
            `crop=${directPlan.cropWidth}:${directPlan.cropHeight}:${directPlan.cropX}:${directPlan.cropY}`
          );
        }

        const baseArgs = [
          "-i",
          sourceFileName,
          "-map",
          "0:v:0",
          "-vf",
          videoFilters.join(","),
          "-r",
          String(frameRate),
        ];

        if (directPlan.includeAudio) {
          const audioFilters = [
            `atrim=start=${directPlan.sourceStart.toFixed(6)}:duration=${directPlan.sourceDuration.toFixed(6)}`,
            "asetpts=N/SR/TB",
            ...buildAtempoFilters(getClipPlaybackSpeed(directPlan.clip)),
          ];
          if (Math.abs(directPlan.audioVolume - 100) > EXPORT_EPSILON) {
            audioFilters.push(`volume=${(directPlan.audioVolume / 100).toFixed(6)}`);
          }
          baseArgs.push("-map", "0:a:0?", "-af", audioFilters.join(","));
          hasAudioInput = true;
        }

        await encodeOutputFile({
          ffmpeg,
          format,
          baseArgs,
          compressionSettings,
          hasAudioInput,
          outputFileName,
          encodeBase,
          encodeWeight,
          setExportProgress,
        });

        const outputBytes = await readBinaryOutputFile(ffmpeg, outputFileName);
        downloadBlob(
          new Blob([cloneToArrayBuffer(outputBytes)], { type: isMov ? "video/quicktime" : "video/mp4" }),
          `${sanitizeFileName(exportFileName || projectName)}.${format}`
        );
        trackEvent("file_export", {
          tool: "video",
          output_format: format,
          include_audio: hasAudioInput,
          compression,
          has_custom_range: hasCustomRange,
          duration_seconds: Number(duration.toFixed(2)),
        });
        setExportProgress({
          stage: "Finalizing",
          percent: 100,
          detail: "Download ready",
        });
        return;
      }

      const sortedTracks = [...tracks].reverse();
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = project.canvasSize.width;
      exportCanvas.height = project.canvasSize.height;
      const exportCtx = exportCanvas.getContext("2d");
      if (!exportCtx) {
        showErrorToast(`${exportFailedLabel}: export canvas unavailable`);
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

      const clipsByTrack = new Map<string, Clip[]>();
      for (const clip of clips) {
        const list = clipsByTrack.get(clip.trackId);
        if (list) {
          list.push(clip);
        } else {
          clipsByTrack.set(clip.trackId, [clip]);
        }
      }
      for (const trackClips of clipsByTrack.values()) {
        trackClips.sort((a, b) => a.startTime - b.startTime);
      }

      const masksByTrack = new Map<string, TimedTrackMask[]>();
      for (const mask of masksMap.values()) {
        if (!mask.maskData) continue;
        const list = masksByTrack.get(mask.trackId);
        const timedMask = {
          startTime: mask.startTime,
          endTime: mask.startTime + mask.duration,
          maskData: mask.maskData,
        };
        if (list) {
          list.push(timedMask);
        } else {
          masksByTrack.set(mask.trackId, [timedMask]);
        }
      }
      for (const trackMasks of masksByTrack.values()) {
        trackMasks.sort((a, b) => a.startTime - b.startTime);
      }

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

        const activeEntries: TrackRenderEntry[] = [];
        const pendingVideoSeeks: Promise<boolean>[] = [];

        for (const track of sortedTracks) {
          if (!track.visible) continue;
          const trackClips = clipsByTrack.get(track.id);
          if (!trackClips) continue;
          const clip = findActiveClipAtTime(trackClips, frameTime);
          if (!clip || !clip.visible || clip.type === "audio") continue;
          activeEntries.push({ clip });

          if (clip.type === "video") {
            const video = exportVideoCache.get(clip.id);
            if (!video) continue;
            const sourceTime = getSourceTime(clip, frameTime);
            pendingVideoSeeks.push(seekExportVideoFrame(video, sourceTime));
          }
        }

        if (pendingVideoSeeks.length > 0) {
          await Promise.all(pendingVideoSeeks);
        }

        for (const { clip } of activeEntries) {
          let sourceEl: CanvasImageSource | null = null;
          if (clip.type === "video") {
            const video = exportVideoCache.get(clip.id);
            if (!video || video.readyState < 2) continue;
            const sourceTime = getSourceTime(clip, frameTime);
            if (Math.abs(video.currentTime - sourceTime) > 0.05) continue;
            sourceEl = video;
          } else if (clip.type === "image") {
            const img = exportImageCache.get(clip.sourceUrl);
            if (img && img.complete && img.naturalWidth > 0) {
              sourceEl = img;
            }
          }
          if (!sourceEl) continue;

          const clipScaleX = getClipScaleX(clip);
          const clipScaleY = getClipScaleY(clip);
          const clipPosition = resolveClipPositionAtTimelineTime(clip, frameTime);

          const trackMasks = masksByTrack.get(clip.trackId) ?? [];
          const maskData = findActiveMaskAtTime(trackMasks, frameTime);
          if (maskData && exportMaskTmpCtx) {
            const maskImg = exportMaskImgCache.get(maskData);
            if (maskImg && maskImg.complete && maskImg.naturalWidth > 0) {
              exportMaskTmpCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
              exportMaskTmpCtx.globalCompositeOperation = "source-over";
              exportMaskTmpCtx.globalAlpha = 1;
              exportMaskTmpCtx.drawImage(
                sourceEl,
                clipPosition.x,
                clipPosition.y,
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
              clipPosition.x,
              clipPosition.y,
              clip.sourceSize.width * clipScaleX,
              clip.sourceSize.height * clipScaleY
            );
            exportCtx.globalAlpha = 1;
          }
        }

        const frameBlob = await canvasToBlob(exportCanvas, "image/png");
        const frameName = `${filePrefix}-frame-${String(frameIndex).padStart(6, "0")}.png`;
        frameNames.push(frameName);
        cleanupFileNames.push(frameName);
        await writeBlobToFfmpegFile(ffmpeg, frameName, frameBlob);

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
        const sourceBufferCache = audioBufferCacheRef.current;
        const mixedAudio = await renderTimelineAudioBuffer(
          clips,
          tracks,
          exportStart,
          duration,
          sourceBufferCache
        );
        if (mixedAudio) {
          const wavBlob = audioBufferToWavBlob(mixedAudio);
          cleanupFileNames.push(wavFileName);
          await writeBlobToFfmpegFile(ffmpeg, wavFileName, wavBlob);
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

      await encodeOutputFile({
        ffmpeg,
        format,
        baseArgs,
        compressionSettings,
        hasAudioInput,
        outputFileName,
        encodeBase,
        encodeWeight,
        setExportProgress,
      });

      const outputBytes = await readBinaryOutputFile(ffmpeg, outputFileName);

      downloadBlob(
        new Blob([cloneToArrayBuffer(outputBytes)], { type: isMov ? "video/quicktime" : "video/mp4" }),
        `${sanitizeFileName(exportFileName || projectName)}.${format}`
      );
      trackEvent("file_export", {
        tool: "video",
        output_format: format,
        include_audio: hasAudioInput,
        compression,
        has_custom_range: hasCustomRange,
        duration_seconds: Number(duration.toFixed(2)),
      });
      setExportProgress({
        stage: "Finalizing",
        percent: 100,
        detail: "Download ready",
      });
    } catch (error) {
      console.error("Video export failed:", error);
      showErrorToast(`${exportFailedLabel}: ${(error as Error).message}`);
    } finally {
      try {
        const ffmpeg = ffmpegRef.current;
        if (ffmpeg) {
          await Promise.all(
            cleanupFileNames.map((fileName) => ffmpeg.deleteFile(fileName).catch(() => {}))
          );
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
