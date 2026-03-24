import { trackEvent } from "@/shared/utils/analytics";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import {
  type Clip,
  type MaskData,
  type PlaybackState,
  type VideoProject,
  type VideoTrack,
} from "../types";
import { resolveVideoExportConfig } from "./videoExportHelpers";
import { cloneToArrayBuffer, unmountFfmpegMountPoint } from "./videoExportIO";
import {
  finalizeNativeRecorderExport,
  runNativeRecorderDirectExport,
} from "./videoExportNativeRecorder";
import type {
  CompletedVideoExport,
  ExportProgressState,
  VideoExportOptions,
  VideoExportStrategyDecision,
} from "./videoExportTypes";
import {
  resolveVideoExportStrategy,
  type ResolvedVideoExportStrategy,
} from "./videoExportStrategy";
import {
  runDirectVideoExport,
  runFrameSequenceExport,
  type VideoExportSession,
} from "./videoExportExecution";

interface RunVideoExportParams {
  getFFmpeg: () => Promise<FFmpeg>;
  project: VideoProject;
  playback: PlaybackState;
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  exportOptions?: VideoExportOptions;
  setExportProgress: (value: ExportProgressState) => void;
  audioBufferCache: Map<string, AudioBuffer | null>;
  sourceBlobCache: Map<string, Blob>;
}

function createStrategyAwareProgressSetter(
  setExportProgress: (value: ExportProgressState) => void,
  decision: VideoExportStrategyDecision
) {
  return (value: ExportProgressState) =>
    setExportProgress({
      ...value,
      strategy: decision.strategy,
      strategyReason: decision.reason,
      strategyEngine: decision.engine,
    });
}

function logVideoExportStrategy(params: {
  decision: VideoExportStrategyDecision;
  project: VideoProject;
}) {
  const { decision, project } = params;
  console.info("[VideoExport] strategy selected", {
    strategy: decision.strategy,
    subStrategy: decision.subStrategy ?? null,
    engine: decision.engine ?? null,
    reason: decision.reason,
    eligibility: decision.eligibility,
    canvasSize: project.canvasSize,
    pixelCount: project.canvasSize.width * project.canvasSize.height,
  });
}

function createVideoExportSession(
  ffmpeg: FFmpeg,
  format: "mp4" | "mov"
): VideoExportSession {
  const filePrefix = `export-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const outputFileName = `${filePrefix}.${format}`;
  return {
    ffmpeg,
    filePrefix,
    outputFileName,
    wavFileName: `${filePrefix}.wav`,
    cleanupFileNames: [outputFileName],
    cleanupMountPoints: [],
    cleanupObjectUrls: [],
    exportVideoCache: new Map<string, HTMLVideoElement>(),
  };
}

async function cleanupVideoExportSession(session: VideoExportSession): Promise<void> {
  await Promise.all(
    session.cleanupFileNames.map((fileName) => session.ffmpeg.deleteFile(fileName).catch(() => {}))
  );
  await Promise.all(
    session.cleanupMountPoints.map((mountPoint) => unmountFfmpegMountPoint(session.ffmpeg, mountPoint))
  );
  for (const video of session.exportVideoCache.values()) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  for (const objectUrl of session.cleanupObjectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
}

function trackCompletedExport(result: CompletedVideoExport): void {
  trackEvent("file_export", {
    tool: "video",
    output_format: result.format,
    include_audio: result.hasAudioInput,
    compression: result.compression,
    has_custom_range: result.hasCustomRange,
    duration_seconds: Number(result.duration.toFixed(2)),
  });
}

async function runNativeRecorderStrategy(params: {
  strategyDecision: ResolvedVideoExportStrategy;
  config: ReturnType<typeof resolveVideoExportConfig>;
  clips: Clip[];
  tracks: VideoTrack[];
  getFFmpeg: () => Promise<FFmpeg>;
  audioBufferCache: Map<string, AudioBuffer | null>;
  sourceBlobCache: Map<string, Blob>;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<CompletedVideoExport> {
  const {
    strategyDecision,
    config,
    clips,
    tracks,
    getFFmpeg,
    audioBufferCache,
    sourceBlobCache,
    setExportProgress,
  } = params;
  if (
    strategyDecision.strategy !== "direct-single-video" ||
    strategyDecision.subStrategy !== "reencode" ||
    strategyDecision.engine !== "native-recorder" ||
    !strategyDecision.directPlan ||
    strategyDecision.directPlan.kind !== "single" ||
    !strategyDecision.sourceBlob ||
    !strategyDecision.nativeRecorderMimeType
  ) {
    throw new Error("네이티브 인코더 전략 구성이 올바르지 않습니다.");
  }

  const nativeVideo = await runNativeRecorderDirectExport({
    plan: strategyDecision.directPlan,
    sourceBlob: strategyDecision.sourceBlob,
    mimeType: strategyDecision.nativeRecorderMimeType,
    config,
    setExportProgress,
    sourceBlobCache,
  });
  const ffmpeg = config.includeAudio && strategyDecision.directPlan.includeAudio
    ? await getFFmpeg()
    : null;
  const session = ffmpeg ? createVideoExportSession(ffmpeg, config.format) : null;
  try {
    return await finalizeNativeRecorderExport({
      nativeVideo,
      config,
      plan: strategyDecision.directPlan,
      clips,
      tracks,
      ffmpeg: session?.ffmpeg ?? (null as never),
      filePrefix: session?.filePrefix ?? `native-export-${Date.now()}`,
      outputFileName: session?.outputFileName ?? `native-export.${config.format}`,
      wavFileName: session?.wavFileName ?? "native-export.wav",
      cleanupFileNames: session?.cleanupFileNames ?? [],
      cleanupMountPoints: session?.cleanupMountPoints ?? [],
      audioBufferCache,
      sourceBlobCache,
      setExportProgress,
    });
  } finally {
    if (session) {
      await cleanupVideoExportSession(session);
    }
  }
}

async function runFfmpegStrategy(params: {
  strategyDecision: ResolvedVideoExportStrategy;
  config: ReturnType<typeof resolveVideoExportConfig>;
  getFFmpeg: () => Promise<FFmpeg>;
  project: VideoProject;
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  audioBufferCache: Map<string, AudioBuffer | null>;
  sourceBlobCache: Map<string, Blob>;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<CompletedVideoExport> {
  const {
    strategyDecision,
    config,
    getFFmpeg,
    project,
    clips,
    tracks,
    masksMap,
    audioBufferCache,
    sourceBlobCache,
    setExportProgress,
  } = params;
  const ffmpeg = await getFFmpeg();
  const session = createVideoExportSession(ffmpeg, config.format);
  try {
    if (strategyDecision.strategy === "direct-single-video") {
      return await runDirectVideoExport({
        session,
        decision: strategyDecision,
        config,
        setExportProgress,
      });
    }

    return await runFrameSequenceExport({
      session,
      project,
      clips,
      tracks,
      masksMap,
      config,
      setExportProgress,
      audioBufferCache,
      sourceBlobCache,
      decision: strategyDecision,
    });
  } finally {
    await cleanupVideoExportSession(session);
  }
}

export async function runVideoExport(params: RunVideoExportParams): Promise<CompletedVideoExport> {
  const config = resolveVideoExportConfig({
    project: params.project,
    playback: params.playback,
    options: params.exportOptions,
  });

  params.setExportProgress({
    stage: "Preparing export",
    percent: 2,
    detail: config.hasCustomRange
      ? `Range ${config.exportStart.toFixed(2)}s - ${config.exportEnd.toFixed(2)}s`
      : "Loading encoder...",
  });
  const strategyDecision = await resolveVideoExportStrategy({
    project: params.project,
    clips: params.clips,
    tracks: params.tracks,
    masksMap: params.masksMap,
    config,
    sourceBlobCache: params.sourceBlobCache,
  });
  logVideoExportStrategy({
    decision: strategyDecision,
    project: params.project,
  });
  const setProgressWithStrategy = createStrategyAwareProgressSetter(
    params.setExportProgress,
    strategyDecision
  );
  setProgressWithStrategy({
    stage: "Preparing export",
    percent: 3,
    detail: strategyDecision.reason,
  });

  const runFfmpegFallback = () => runFfmpegStrategy({
        strategyDecision,
        config,
        getFFmpeg: params.getFFmpeg,
        project: params.project,
        clips: params.clips,
        tracks: params.tracks,
        masksMap: params.masksMap,
        audioBufferCache: params.audioBufferCache,
        sourceBlobCache: params.sourceBlobCache,
        setExportProgress: setProgressWithStrategy,
      });

  const result = strategyDecision.engine === "native-recorder"
    ? await (async () => {
        try {
          return await runNativeRecorderStrategy({
            strategyDecision,
            config,
            clips: params.clips,
            tracks: params.tracks,
            getFFmpeg: params.getFFmpeg,
            audioBufferCache: params.audioBufferCache,
            sourceBlobCache: params.sourceBlobCache,
            setExportProgress: setProgressWithStrategy,
          });
        } catch (error) {
          console.warn("[VideoExport] native recorder failed, falling back to ffmpeg", {
            error: error instanceof Error ? error.message : String(error),
          });
          setProgressWithStrategy({
            stage: "Preparing export",
            percent: 4,
            detail: "네이티브 export가 실패해 FFmpeg 경로로 전환합니다.",
          });
          return runFfmpegFallback();
        }
      })()
    : await runFfmpegFallback();

  trackCompletedExport(result);
  return result;
}

export function createVideoExportBlob(result: CompletedVideoExport): Blob {
  return new Blob([cloneToArrayBuffer(result.outputBytes)], { type: result.outputMimeType });
}
