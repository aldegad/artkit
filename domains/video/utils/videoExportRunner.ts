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
import { runWebCodecsDirectExport } from "./videoExportWebCodecs";
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

  if (
    strategyDecision.strategy === "direct-single-video" &&
    strategyDecision.subStrategy === "reencode" &&
    strategyDecision.engine === "webcodecs" &&
    strategyDecision.directPlan &&
    strategyDecision.sourceBlob &&
    strategyDecision.sourceExtension
  ) {
    const result = await runWebCodecsDirectExport({
      plan: strategyDecision.directPlan,
      sourceBlob: strategyDecision.sourceBlob,
      sourceExtension: strategyDecision.sourceExtension,
      config,
      clips: params.clips,
      tracks: params.tracks,
      audioBufferCache: params.audioBufferCache,
      getFFmpeg: params.getFFmpeg,
      setExportProgress: setProgressWithStrategy,
    });
    trackEvent("file_export", {
      tool: "video",
      output_format: result.format,
      include_audio: result.hasAudioInput,
      compression: result.compression,
      has_custom_range: result.hasCustomRange,
      duration_seconds: Number(result.duration.toFixed(2)),
    });
    return result;
  }

  if (
    strategyDecision.strategy === "direct-single-video" &&
    strategyDecision.subStrategy === "reencode" &&
    strategyDecision.engine === "native-recorder" &&
    strategyDecision.directPlan &&
    strategyDecision.sourceBlob &&
    strategyDecision.nativeRecorderMimeType
  ) {
    const nativeVideo = await runNativeRecorderDirectExport({
      plan: strategyDecision.directPlan,
      sourceBlob: strategyDecision.sourceBlob,
      mimeType: strategyDecision.nativeRecorderMimeType,
      config,
      setExportProgress: setProgressWithStrategy,
    });
    const ffmpeg = config.includeAudio && strategyDecision.directPlan.includeAudio
      ? await params.getFFmpeg()
      : null;
    const session = ffmpeg ? createVideoExportSession(ffmpeg, config.format) : null;
    try {
      const result = await finalizeNativeRecorderExport({
        nativeVideo,
        config,
        plan: strategyDecision.directPlan,
        clips: params.clips,
        tracks: params.tracks,
        ffmpeg: session?.ffmpeg ?? (null as never),
        filePrefix: session?.filePrefix ?? `native-export-${Date.now()}`,
        outputFileName: session?.outputFileName ?? `native-export.${config.format}`,
        wavFileName: session?.wavFileName ?? "native-export.wav",
        cleanupFileNames: session?.cleanupFileNames ?? [],
        cleanupMountPoints: session?.cleanupMountPoints ?? [],
        audioBufferCache: params.audioBufferCache,
        setExportProgress: setProgressWithStrategy,
      });
      trackEvent("file_export", {
        tool: "video",
        output_format: result.format,
        include_audio: result.hasAudioInput,
        compression: result.compression,
        has_custom_range: result.hasCustomRange,
        duration_seconds: Number(result.duration.toFixed(2)),
      });
      return result;
    } finally {
      if (session) {
        await cleanupVideoExportSession(session);
      }
    }
  }

  const ffmpeg = await params.getFFmpeg();
  const session = createVideoExportSession(ffmpeg, config.format);
  try {
    const directResult = await runDirectVideoExport({
      session,
      decision: strategyDecision,
      config,
      setExportProgress: setProgressWithStrategy,
    });
    const result = directResult ?? await runFrameSequenceExport({
      session,
      project: params.project,
      clips: params.clips,
      tracks: params.tracks,
      masksMap: params.masksMap,
      config,
      setExportProgress: setProgressWithStrategy,
      audioBufferCache: params.audioBufferCache,
      decision: strategyDecision,
    });

    trackEvent("file_export", {
      tool: "video",
      output_format: result.format,
      include_audio: result.hasAudioInput,
      compression: result.compression,
      has_custom_range: result.hasCustomRange,
      duration_seconds: Number(result.duration.toFixed(2)),
    });
    return result;
  } finally {
    await cleanupVideoExportSession(session);
  }
}

export function createVideoExportBlob(result: CompletedVideoExport): Blob {
  return new Blob([cloneToArrayBuffer(result.outputBytes)], { type: result.outputMimeType });
}
