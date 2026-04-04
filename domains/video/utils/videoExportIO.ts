import { loadMediaBlobFromKeys } from "./mediaStorage";
import type { Clip } from "../types";
import type {
  ExportProgressState,
  VideoExportCompressionSettings,
  VideoExportFormat,
} from "./videoExportTypes";

const FFMPEG_WORKER_FS_TYPE = "WORKERFS" as const;
const LARGE_EXPORT_PIXEL_THRESHOLD = 6_000_000;
const MIN_MEDIA_DURATION_SECONDS = 0.001;
const DURATION_RECOVERY_SEEK_TIME = 1000000;

function readFiniteMediaDuration(duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  return Math.max(duration, MIN_MEDIA_DURATION_SECONDS);
}

async function ensureFiniteMediaDuration(
  media: HTMLMediaElement,
  timeoutMs: number = 2500
): Promise<number | null> {
  const immediate = readFiniteMediaDuration(media.duration);
  if (immediate != null) {
    return immediate;
  }

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      media.removeEventListener("durationchange", handleReady);
      media.removeEventListener("timeupdate", handleReady);
      media.removeEventListener("seeked", handleReady);
      media.removeEventListener("loadeddata", handleReady);
      media.removeEventListener("canplay", handleReady);
      media.removeEventListener("error", handleError);
    };

    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(duration);
    };

    const handleReady = () => {
      const next = readFiniteMediaDuration(media.duration);
      if (next != null) {
        finish(next);
      }
    };

    const handleError = () => finish(null);
    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);

    media.addEventListener("durationchange", handleReady);
    media.addEventListener("timeupdate", handleReady);
    media.addEventListener("seeked", handleReady);
    media.addEventListener("loadeddata", handleReady);
    media.addEventListener("canplay", handleReady);
    media.addEventListener("error", handleError, { once: true });

    try {
      media.currentTime = DURATION_RECOVERY_SEEK_TIME;
    } catch {
      finish(null);
    }
  });
}

export async function loadExportVideoElement(sourceUrl: string): Promise<HTMLVideoElement | null> {
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

    video.onloadedmetadata = async () => {
      await ensureFiniteMediaDuration(video).catch(() => null);
      cleanup();
      resolve(video);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

export async function resolveBlobMediaDuration(blob: Blob): Promise<number | null> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const video = await loadExportVideoElement(objectUrl);
    if (!video) {
      return null;
    }
    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : null;
    video.pause();
    video.removeAttribute("src");
    video.load();
    return duration;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function seekExportVideoFrame(
  video: HTMLVideoElement,
  targetTime: number,
  timeoutMs: number = 2000
): Promise<boolean> {
  const recoveredDuration = await ensureFiniteMediaDuration(video, timeoutMs);
  if (recoveredDuration == null) return false;

  const maxTime = Math.max(0, recoveredDuration - 0.001);
  const clamped = Math.max(0, Math.min(targetTime, maxTime));
  const originalPlaybackRate = video.playbackRate;
  const originalDefaultPlaybackRate = video.defaultPlaybackRate;

  const restorePlaybackRate = () => {
    video.defaultPlaybackRate = originalDefaultPlaybackRate;
    video.playbackRate = originalPlaybackRate;
  };

  const waitForReadyFrame = () =>
    new Promise<boolean>((resolve) => {
      let settled = false;

      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener("loadeddata", onReadyForFrame);
        video.removeEventListener("canplay", onReadyForFrame);
        video.removeEventListener("canplaythrough", onReadyForFrame);
        video.removeEventListener("error", onError);
      };

      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(success);
      };

      const onReadyForFrame = () => {
        finish(video.readyState >= 2);
      };

      const onError = () => {
        finish(false);
      };

      const timeout = window.setTimeout(() => {
        finish(false);
      }, timeoutMs);

      video.addEventListener("loadeddata", onReadyForFrame, { once: true });
      video.addEventListener("canplay", onReadyForFrame, { once: true });
      video.addEventListener("canplaythrough", onReadyForFrame, { once: true });
      video.addEventListener("error", onError, { once: true });
    });

  const seekable = video.seekable;
  if (seekable.length > 0) {
    let canReachTarget = false;
    for (let index = 0; index < seekable.length; index += 1) {
      const rangeStart = seekable.start(index);
      const rangeEnd = seekable.end(index);
      if (clamped >= rangeStart - 0.05 && clamped <= rangeEnd + 0.05) {
        canReachTarget = true;
        break;
      }
    }
    if (!canReachTarget) {
      return false;
    }
  }

  try {
    // Some MOV sources are sensitive to non-1x seek setup. Normalize only for the seek,
    // then let the caller restore the intended playback rate right before playback.
    video.defaultPlaybackRate = 1;
    video.playbackRate = 1;

    if (Math.abs(video.currentTime - clamped) <= 0.01) {
      if (video.readyState >= 2) {
        return true;
      }
      try {
        video.currentTime = clamped;
      } catch {
        return false;
      }
      return await waitForReadyFrame();
    }

    return await new Promise((resolve) => {
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
        video.removeEventListener("loadeddata", onReadyForFrame);
        video.removeEventListener("canplay", onReadyForFrame);
        video.removeEventListener("canplaythrough", onReadyForFrame);
      };

      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(success);
      };

      const onReadyForFrame = () => {
        finish(video.readyState >= 2);
      };

      const onSeeked = () => {
        if (settled) return;
        if (video.readyState >= 2) {
          finish(true);
          return;
        }
        video.addEventListener("loadeddata", onReadyForFrame, { once: true });
        video.addEventListener("canplay", onReadyForFrame, { once: true });
        video.addEventListener("canplaythrough", onReadyForFrame, { once: true });
      };
      const onError = () => {
        finish(false);
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
  } finally {
    restorePlaybackRate();
  }
}

type ClipSourceReference = Pick<Clip, "id" | "sourceId" | "sourceUrl">;

function getSourceBlobCacheKey(clip: ClipSourceReference): string {
  return `${clip.id}:${clip.sourceUrl ?? ""}`;
}

export async function resolveClipSourceBlob(
  clip: ClipSourceReference,
  sourceBlobCache?: Map<string, Blob>
): Promise<Blob> {
  const cacheKey = getSourceBlobCacheKey(clip);
  const cachedBlob = sourceBlobCache?.get(cacheKey);
  if (cachedBlob) return cachedBlob;

  const sourceUrl = typeof clip.sourceUrl === "string" ? clip.sourceUrl : "";
  const shouldTrySourceUrlFirst =
    sourceUrl.startsWith("blob:") ||
    sourceUrl.startsWith("data:") ||
    /^https?:/i.test(sourceUrl);

  if (shouldTrySourceUrlFirst) {
    try {
      const response = await fetch(sourceUrl);
      if (response.ok) {
        const blob = await response.blob();
        sourceBlobCache?.set(cacheKey, blob);
        return blob;
      }
    } catch {
      // Fall through to persisted media lookup.
    }
  }

  const storedBlob = await loadMediaBlobFromKeys([clip.id, clip.sourceId]).catch(() => null);
  if (storedBlob) {
    sourceBlobCache?.set(cacheKey, storedBlob);
    return storedBlob;
  }

  if (!sourceUrl) {
    throw new Error("clip source URL is missing");
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`failed to load source media (${response.status})`);
  }
  const blob = await response.blob();
  sourceBlobCache?.set(cacheKey, blob);
  return blob;
}

export async function mountBlobToFfmpegFile(
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg,
  fileName: string,
  blob: Blob
): Promise<{ mountPoint: string; filePath: string }> {
  const mountPoint = `/mnt-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  await ffmpeg.createDir(mountPoint);
  await ffmpeg.mount(FFMPEG_WORKER_FS_TYPE as Parameters<typeof ffmpeg.mount>[0], {
    blobs: [{ name: fileName, data: blob }],
  }, mountPoint);
  return {
    mountPoint,
    filePath: `${mountPoint}/${fileName}`,
  };
}

export async function unmountFfmpegMountPoint(
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg,
  mountPoint: string
): Promise<void> {
  await ffmpeg.unmount(mountPoint).catch(() => {});
  await ffmpeg.deleteDir(mountPoint).catch(() => {});
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

function resolveEncoderThreadCount(outputPixelCount: number): string {
  if (outputPixelCount >= LARGE_EXPORT_PIXEL_THRESHOLD) {
    return "1";
  }

  const canUseThreadedWasm =
    typeof window !== "undefined" &&
    window.crossOriginIsolated &&
    typeof SharedArrayBuffer !== "undefined";
  if (!canUseThreadedWasm || typeof navigator === "undefined") {
    return "1";
  }

  const hardwareThreads = Number.isFinite(navigator.hardwareConcurrency)
    ? navigator.hardwareConcurrency || 1
    : 1;
  return String(Math.max(1, Math.min(8, hardwareThreads)));
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
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let latestPhaseRatio = 0;
  let latestPhasePercent = 0;
  let hasSeenProgressEvent = false;
  let monitorTimer: number | null = null;
  const recentLogs: string[] = [];
  let latestEncodeLog = "";
  let lastReportedStallSecond = -1;
  let exitCode: number | null = null;

  const summarizeEncodeLog = (message: string): string => {
    const normalized = message.replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    if (normalized.startsWith("frame=") || normalized.includes(" time=")) {
      return normalized.slice(0, 120);
    }
    return "";
  };

  const updateEncodeStatus = () => {
    const now = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
    const stalledSeconds = Math.max(0, Math.floor((now - lastProgressAt) / 1000));
    const waitingForFirstProgress = !hasSeenProgressEvent;
    const isStalled = waitingForFirstProgress
      ? elapsedSeconds >= 15
      : stalledSeconds >= 15;
    const displayPhasePercent = latestPhaseRatio > 0 && latestPhaseRatio < 0.1
      ? Number((latestPhaseRatio * 100).toFixed(1))
      : latestPhasePercent;

    const detail = waitingForFirstProgress
      ? isStalled
        ? `인코더 첫 응답 지연 중... ${elapsedSeconds}s${latestEncodeLog ? ` · ${latestEncodeLog}` : ""}`
        : `인코더 시작 중... ${elapsedSeconds}s${latestEncodeLog ? ` · ${latestEncodeLog}` : ""}`
      : isStalled
        ? `인코딩 진행 중... ${displayPhasePercent}% · ${elapsedSeconds}s${latestEncodeLog ? ` · ${latestEncodeLog}` : ""}`
        : `인코딩 ${displayPhasePercent}% · ${elapsedSeconds}s`;

    if (isStalled && elapsedSeconds !== lastReportedStallSecond) {
      lastReportedStallSecond = elapsedSeconds;
      console.warn("[VideoExport] ffmpeg appears stalled", {
        stage,
        elapsedSeconds,
        waitingForFirstProgress,
        phasePercent: displayPhasePercent,
        latestEncodeLog,
        recentLogs: recentLogs.slice(-4),
      });
    }

    setExportProgress({
      stage,
      percent: Math.min(98, encodeBase + (latestPhaseRatio * encodeWeight)),
      detail,
      phasePercent: displayPhasePercent,
      elapsedSeconds,
      isIndeterminate: waitingForFirstProgress,
      isStalled,
      ffmpegLogSummary: latestEncodeLog || undefined,
    });
  };

  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    const ratio = Math.max(0, Math.min(1, progress || 0));
    latestPhaseRatio = ratio;
    latestPhasePercent = Math.round(ratio * 100);
    hasSeenProgressEvent = true;
    lastProgressAt = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((lastProgressAt - startedAt) / 1000));
    const displayPhasePercent = ratio > 0 && ratio < 0.1
      ? Number((ratio * 100).toFixed(1))
      : latestPhasePercent;

    setExportProgress({
      stage,
      percent: Math.min(98, encodeBase + (ratio * encodeWeight)),
      detail: `인코딩 ${displayPhasePercent}% · ${elapsedSeconds}s`,
      phasePercent: displayPhasePercent,
      elapsedSeconds,
      isIndeterminate: false,
      isStalled: false,
      ffmpegLogSummary: latestEncodeLog || undefined,
    });
  };
  const onFfmpegLog = ({ message }: { type: string; message: string }) => {
    const normalized = message.trim();
    if (!normalized) return;
    recentLogs.push(normalized);
    if (recentLogs.length > 12) {
      recentLogs.splice(0, recentLogs.length - 12);
    }
    const summarized = summarizeEncodeLog(normalized);
    if (summarized) {
      latestEncodeLog = summarized;
    }
  };

  ffmpeg.on("progress", onFfmpegProgress);
  ffmpeg.on("log", onFfmpegLog);
  try {
    console.info("[VideoExport] ffmpeg exec start", {
      stage,
      args,
    });
    updateEncodeStatus();
    monitorTimer = window.setInterval(updateEncodeStatus, 1000);
    exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      const errorDetail = recentLogs.slice(-4).join(" | ");
      throw new Error(
        errorDetail
          ? `ffmpeg exited with code ${exitCode}: ${errorDetail}`
          : `ffmpeg exited with code ${exitCode}`
      );
    }
  } finally {
    console.info("[VideoExport] ffmpeg exec end", {
      stage,
      exitCode,
      recentLogs: recentLogs.slice(-4),
    });
    if (monitorTimer !== null) {
      window.clearInterval(monitorTimer);
    }
    ffmpeg.off("progress", onFfmpegProgress);
    ffmpeg.off("log", onFfmpegLog);
  }
}

export async function encodeOutputFile(params: {
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg;
  format: VideoExportFormat;
  baseArgs: string[];
  compressionSettings: VideoExportCompressionSettings;
  hasAudioInput: boolean;
  outputFileName: string;
  outputSize: { width: number; height: number };
  videoTune?: "animation" | "fastdecode";
  preferFastEncoding?: boolean;
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
    outputSize,
    videoTune,
    preferFastEncoding,
    encodeBase,
    encodeWeight,
    setExportProgress,
  } = params;
  const outputPixelCount = outputSize.width * outputSize.height;
  const shouldUseLowMemoryX264 = outputPixelCount >= LARGE_EXPORT_PIXEL_THRESHOLD;
  const encoderThreadCount = resolveEncoderThreadCount(outputPixelCount);
  const shouldPreferLowLatencyX264 = shouldUseLowMemoryX264 || Boolean(preferFastEncoding);
  const videoPreset = shouldPreferLowLatencyX264
    ? "ultrafast"
    : compressionSettings.preset;
  const args = [
    ...baseArgs,
    "-c:v",
    "libx264",
    "-threads",
    encoderThreadCount,
    "-preset",
    videoPreset,
    "-crf",
    String(compressionSettings.crf),
    ...(videoTune ? ["-tune", videoTune] : []),
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    ...(shouldPreferLowLatencyX264
      ? ["-x264-params", "rc-lookahead=0:sync-lookahead=0:ref=1:bframes=0"]
      : []),
    ...(format === "mov" || format === "mp4" ? ["-movflags", "+faststart"] : []),
    ...getContainerAudioArgs(format, hasAudioInput),
    outputFileName,
  ];

  await runEncodeWithProgress({
    ffmpeg,
    args,
    stage: `Encoding ${format.toUpperCase()}`,
    encodeBase,
    encodeWeight,
    setExportProgress,
  });
}

export async function writeBlobToFfmpegFile(
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg,
  fileName: string,
  blob: Blob
): Promise<void> {
  await ffmpeg.writeFile(fileName, new Uint8Array(await blob.arrayBuffer()));
}

export async function readBinaryOutputFile(
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

export function cloneToArrayBuffer(data: Uint8Array): ArrayBuffer {
  const cloned = new Uint8Array(data.byteLength);
  cloned.set(data);
  return cloned.buffer;
}
