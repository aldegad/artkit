import { loadMediaBlob } from "./mediaStorage";
import type { VideoClip } from "../types";
import type {
  ExportProgressState,
  VideoExportCompressionSettings,
  VideoExportFormat,
} from "./videoExportTypes";

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

export async function seekExportVideoFrame(
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

export async function resolveClipSourceBlob(clip: VideoClip): Promise<Blob> {
  const shouldTrySourceUrlFirst =
    clip.sourceUrl.startsWith("blob:") ||
    clip.sourceUrl.startsWith("data:") ||
    /^https?:/i.test(clip.sourceUrl);

  if (shouldTrySourceUrlFirst) {
    try {
      const response = await fetch(clip.sourceUrl);
      if (response.ok) return response.blob();
    } catch {
      // Fall through to persisted media lookup.
    }
  }

  const storedBlob = await loadMediaBlob(clip.id).catch(() => null);
  if (storedBlob) return storedBlob;

  const response = await fetch(clip.sourceUrl);
  if (!response.ok) {
    throw new Error(`failed to load source media (${response.status})`);
  }
  return response.blob();
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
  let latestPhasePercent = 0;
  let monitorTimer: number | null = null;

  const updateEncodeStatus = () => {
    const now = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
    const stalledSeconds = Math.max(0, Math.floor((now - lastProgressAt) / 1000));
    const waitingForFirstProgress = latestPhasePercent <= 0;
    const isStalled = waitingForFirstProgress
      ? elapsedSeconds >= 15
      : stalledSeconds >= 15;

    const detail = waitingForFirstProgress
      ? isStalled
        ? `인코더 첫 응답 지연 중... ${elapsedSeconds}s`
        : `인코더 시작 중... ${elapsedSeconds}s`
      : isStalled
        ? `인코딩 지연 중... ${latestPhasePercent}% · ${elapsedSeconds}s`
        : `인코딩 ${latestPhasePercent}% · ${elapsedSeconds}s`;

    setExportProgress({
      stage,
      percent: Math.min(98, encodeBase + ((latestPhasePercent / 100) * encodeWeight)),
      detail,
      phasePercent: latestPhasePercent,
      elapsedSeconds,
      isIndeterminate: waitingForFirstProgress,
      isStalled,
    });
  };

  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    const ratio = Math.max(0, Math.min(1, progress || 0));
    latestPhasePercent = Math.round(ratio * 100);
    lastProgressAt = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((lastProgressAt - startedAt) / 1000));
    const waitingForMeaningfulProgress = latestPhasePercent <= 0;

    setExportProgress({
      stage,
      percent: Math.min(98, encodeBase + (ratio * encodeWeight)),
      detail: waitingForMeaningfulProgress
        ? `인코더 응답 수신, 시작 준비 중... ${elapsedSeconds}s`
        : `인코딩 ${latestPhasePercent}% · ${elapsedSeconds}s`,
      phasePercent: latestPhasePercent,
      elapsedSeconds,
      isIndeterminate: waitingForMeaningfulProgress,
      isStalled: false,
    });
  };

  ffmpeg.on("progress", onFfmpegProgress);
  try {
    updateEncodeStatus();
    monitorTimer = window.setInterval(updateEncodeStatus, 1000);
    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      throw new Error(`ffmpeg exited with code ${exitCode}`);
    }
  } finally {
    if (monitorTimer !== null) {
      window.clearInterval(monitorTimer);
    }
    ffmpeg.off("progress", onFfmpegProgress);
  }
}

export async function encodeOutputFile(params: {
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg;
  format: VideoExportFormat;
  baseArgs: string[];
  compressionSettings: VideoExportCompressionSettings;
  hasAudioInput: boolean;
  outputFileName: string;
  encodeBase: number;
  encodeWeight: number;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<void> {
  const { ffmpeg, format, baseArgs, compressionSettings, hasAudioInput, outputFileName, encodeBase, encodeWeight, setExportProgress } = params;
  const args = [
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
