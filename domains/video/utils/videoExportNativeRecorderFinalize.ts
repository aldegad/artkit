import type { Clip, VideoTrack } from "../types";
import {
  audioBufferToWavBlob,
  fitAudioBufferToDuration,
  renderDirectPlanAudioBuffer,
  renderTimelineAudioBuffer,
  type DirectVideoExportPlan,
} from "./videoExportHelpers";
import {
  mountBlobToFfmpegFile,
  readBinaryOutputFile,
  resolveBlobMediaDuration,
  writeBlobToFfmpegFile,
} from "./videoExportIO";
import type {
  CompletedVideoExport,
  ExportProgressState,
  ResolvedVideoExportConfig,
} from "./videoExportTypes";
import { toUint8Array, type NativeRecordedVideoExport } from "./videoExportNativeRecorderShared";

export async function finalizeNativeRecorderExport(params: {
  nativeVideo: NativeRecordedVideoExport;
  config: ResolvedVideoExportConfig;
  plan: DirectVideoExportPlan | null;
  clips: Clip[];
  tracks: VideoTrack[];
  ffmpeg?: import("@ffmpeg/ffmpeg").FFmpeg | null;
  filePrefix: string;
  outputFileName: string;
  wavFileName: string;
  cleanupFileNames: string[];
  cleanupMountPoints: string[];
  audioBufferCache: Map<string, AudioBuffer | null>;
  sourceBlobCache: Map<string, Blob>;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<CompletedVideoExport> {
  const {
    nativeVideo,
    config,
    plan,
    clips,
    tracks,
    ffmpeg,
    filePrefix,
    outputFileName,
    wavFileName,
    cleanupFileNames,
    cleanupMountPoints,
    audioBufferCache,
    sourceBlobCache,
    setExportProgress,
  } = params;
  if (!config.includeAudio || (plan ? !plan.includeAudio : false)) {
    const outputBytes = toUint8Array(await nativeVideo.videoBlob.arrayBuffer());
    return {
      outputBytes,
      hasAudioInput: false,
      format: config.format,
      compression: config.compression,
      duration: config.duration,
      hasCustomRange: config.hasCustomRange,
      outputMimeType: nativeVideo.outputMimeType,
    };
  }

  setExportProgress({
    stage: "Rendering audio",
    percent: 85,
    detail: "네이티브 비디오와 합칠 오디오 렌더링 중...",
  });
  const nativeVideoDuration = await resolveBlobMediaDuration(nativeVideo.videoBlob);
  const targetDuration =
    Number.isFinite(nativeVideoDuration) && nativeVideoDuration != null
      ? Math.max(0.001, nativeVideoDuration)
      : config.duration;
  const mixedAudio = await (
    plan?.kind === "sequence"
      ? renderDirectPlanAudioBuffer({
          plan,
          projectDuration: targetDuration,
          frameRate: config.frameRate,
          recordedSegmentTimelineDurations: nativeVideo.recordedSegmentTimelineDurations,
          sourceBufferCache: audioBufferCache,
          sourceBlobCache,
        })
      : renderTimelineAudioBuffer({
          clips,
          tracks,
          timelineStart: config.exportStart,
          projectDuration: targetDuration,
          sourceBufferCache: audioBufferCache,
          sourceBlobCache,
        })
  );

  if (!mixedAudio) {
    const outputBytes = toUint8Array(await nativeVideo.videoBlob.arrayBuffer());
    return {
      outputBytes,
      hasAudioInput: false,
      format: config.format,
      compression: config.compression,
      duration: config.duration,
      hasCustomRange: config.hasCustomRange,
      outputMimeType: nativeVideo.outputMimeType,
    };
  }
  const fittedAudio = fitAudioBufferToDuration(mixedAudio, targetDuration);

  setExportProgress({
    stage: "Muxing audio",
    percent: 92,
    detail: "네이티브 비디오와 오디오를 결합하는 중...",
  });

  if (!ffmpeg) {
    throw new Error("오디오 결합용 ffmpeg 세션이 준비되지 않았습니다.");
  }

  const nativeVideoFileName = `${filePrefix}-native-video.mp4`;
  const mountedVideo = await mountBlobToFfmpegFile(ffmpeg, nativeVideoFileName, nativeVideo.videoBlob);
  cleanupMountPoints.push(mountedVideo.mountPoint);
  cleanupFileNames.push(outputFileName, wavFileName);
  await writeBlobToFfmpegFile(ffmpeg, wavFileName, audioBufferToWavBlob(fittedAudio));

  const exitCode = await ffmpeg.exec([
    "-fflags",
    "+genpts",
    "-i",
    mountedVideo.filePath,
    "-i",
    wavFileName,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-af",
    "aresample=async=0:first_pts=0",
    "-shortest",
    "-avoid_negative_ts",
    "make_zero",
    "-muxpreload",
    "0",
    "-muxdelay",
    "0",
    "-movflags",
    "+faststart",
    outputFileName,
  ]);

  if (exitCode !== 0) {
    throw new Error(`네이티브 비디오와 오디오 결합에 실패했습니다. (ffmpeg exit ${exitCode})`);
  }

  const outputBytes = await readBinaryOutputFile(ffmpeg, outputFileName);
  return {
    outputBytes,
    hasAudioInput: true,
    format: config.format,
    compression: config.compression,
    duration: config.duration,
    hasCustomRange: config.hasCustomRange,
    outputMimeType: config.outputMimeType,
  };
}
