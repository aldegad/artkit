import {
  resolveVideoExportCompression,
  type DirectVideoExportPlan,
} from "./videoExportHelpers";
import type {
  ExportProgressState,
  ResolvedVideoExportConfig,
  VideoExportCompression,
} from "./videoExportTypes";

const NATIVE_RECORDER_MP4_MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.64001f,mp4a.40.2"',
  'video/mp4;codecs="avc1.4d401f,mp4a.40.2"',
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4;codecs=h264,aac",
  "video/mp4",
];

export interface NativeRecorderSupport {
  supported: boolean;
  mimeType?: string;
  reason: string;
}

export interface NativeRecordedVideoExport {
  videoBlob: Blob;
  outputMimeType: string;
  recordedSegmentTimelineDurations?: number[];
}

export function logNativeRecorderStep(step: string, extra?: Record<string, unknown>) {
  console.info("[VideoExport] native recorder step", {
    step,
    ...(extra ?? {}),
  });
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timer: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  }
}

async function waitForRecorderState(
  recorder: MediaRecorder,
  targetState: "paused" | "recording",
  timeoutMs: number,
  message: string
): Promise<void> {
  if (recorder.state === targetState) {
    return;
  }

  const eventName = targetState === "paused" ? "pause" : "resume";
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        recorder.removeEventListener(eventName, handleStateChange);
        recorder.removeEventListener("error", handleError);
      };

      const handleStateChange = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error(`네이티브 recorder ${eventName} 이벤트 대기 중 오류가 발생했습니다.`));
      };

      recorder.addEventListener(eventName, handleStateChange, { once: true });
      recorder.addEventListener("error", handleError, { once: true });
    }),
    timeoutMs,
    message
  );
}

export async function pauseRecorderForBoundary(recorder: MediaRecorder): Promise<void> {
  if (recorder.state !== "recording") {
    return;
  }
  recorder.pause();
  await waitForRecorderState(
    recorder,
    "paused",
    2000,
    "네이티브 recorder pause가 지연되고 있습니다."
  );
}

export async function resumeRecorderForBoundary(recorder: MediaRecorder): Promise<void> {
  if (recorder.state !== "paused") {
    return;
  }
  recorder.resume();
  await waitForRecorderState(
    recorder,
    "recording",
    2000,
    "네이티브 recorder resume이 지연되고 있습니다."
  );
}

function resolveNativeRecorderMimeType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }
  for (const candidate of NATIVE_RECORDER_MP4_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function getNativeRecorderBitrate(params: {
  compression: VideoExportCompression;
  includeAudio: boolean;
}) {
  const compressionSettings = resolveVideoExportCompression(params.compression);
  const videoBitsPerSecond =
    compressionSettings.crf <= 14
      ? 20_000_000
      : compressionSettings.crf >= 24
        ? 8_000_000
        : 12_000_000;
  return {
    videoBitsPerSecond,
    audioBitsPerSecond: params.includeAudio ? 192_000 : undefined,
  };
}

export function setPitchPreservation(video: HTMLVideoElement): void {
  const element = video as HTMLVideoElement & {
    preservesPitch?: boolean;
    mozPreservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };
  if (typeof element.preservesPitch === "boolean") element.preservesPitch = true;
  if (typeof element.mozPreservesPitch === "boolean") element.mozPreservesPitch = true;
  if (typeof element.webkitPreservesPitch === "boolean") element.webkitPreservesPitch = true;
}

export function stopTracks(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer.slice(0));
}

export async function waitForVideoFrame(
  video: HTMLVideoElement,
  timeoutMs: number,
  message: string
): Promise<void> {
  if (typeof video.requestVideoFrameCallback !== "function") {
    return;
  }
  await withTimeout(
    new Promise<void>((resolve) => {
      video.requestVideoFrameCallback(() => resolve());
    }),
    timeoutMs,
    message
  );
}

export function createNativeRecorderProgressUpdater(params: {
  config: ResolvedVideoExportConfig;
  setExportProgress: (value: ExportProgressState) => void;
  startedAt: number;
  expectedWallDuration: number;
  detailPrefix: string;
}) {
  const { config, setExportProgress, startedAt, detailPrefix } = params;
  return (progressRatio: number) => {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const clampedRatio = Math.max(0, Math.min(1, progressRatio));
    const overallPercent = Math.min(98, 70 + clampedRatio * 28);
    const phasePercent = Math.round(clampedRatio * 100);
    setExportProgress({
      stage: `Encoding ${config.format.toUpperCase()}`,
      percent: overallPercent,
      detail: `${detailPrefix} ${phasePercent}% · ${elapsedSeconds}s`,
      phasePercent,
      elapsedSeconds,
    });
  };
}

export function getNativeRecorderSupport(
  config: ResolvedVideoExportConfig,
  plan?: DirectVideoExportPlan | null
): NativeRecorderSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "브라우저 환경이 아니어서 네이티브 인코더를 사용할 수 없습니다." };
  }
  if (config.format !== "mp4") {
    return { supported: false, reason: "네이티브 인코더는 현재 MP4 출력에서만 사용합니다." };
  }
  if (typeof MediaRecorder === "undefined") {
    return { supported: false, reason: "이 브라우저는 MediaRecorder를 지원하지 않습니다." };
  }
  if (typeof document.createElement("canvas").captureStream !== "function") {
    return { supported: false, reason: "이 브라우저는 canvas captureStream을 지원하지 않습니다." };
  }
  if (
    plan &&
    typeof document.createElement("video").requestVideoFrameCallback !== "function"
  ) {
    return { supported: false, reason: "이 브라우저는 requestVideoFrameCallback을 지원하지 않습니다." };
  }
  const mimeType = resolveNativeRecorderMimeType();
  if (!mimeType) {
    return { supported: false, reason: "이 브라우저는 MP4 MediaRecorder 인코딩을 지원하지 않습니다." };
  }
  return {
    supported: true,
    mimeType,
    reason: !plan
      ? "브라우저 네이티브 인코더로 타임라인 캔버스를 직접 기록할 수 있습니다."
      : plan.kind === "sequence"
        ? "브라우저 네이티브 인코더로 분할 시퀀스를 직접 재인코딩할 수 있습니다."
        : "브라우저 네이티브 인코더로 직접 재인코딩할 수 있습니다.",
  };
}
