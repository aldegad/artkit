import type { Clip, MaskData, VideoProject, VideoTrack } from "../types";
import {
  evaluateDirectVideoExportPlan,
  resolveSourceExtension,
  VIDEO_EXPORT_EPSILON,
  type DirectVideoExportPlan,
} from "./videoExportHelpers";
import { resolveClipSourceBlob } from "./videoExportIO";
import { getNativeRecorderSupport } from "./videoExportNativeRecorder";
import { getWebCodecsDirectExportSupport } from "./videoExportWebCodecs";
import type {
  DirectVideoExportSubStrategy,
  DirectVideoExportEngine,
  ResolvedVideoExportConfig,
  VideoExportFormat,
  VideoExportStrategyDecision,
} from "./videoExportTypes";

export interface ResolvedVideoExportStrategy extends VideoExportStrategyDecision {
  directPlan?: DirectVideoExportPlan;
  sourceBlob?: Blob;
  sourceExtension?: string;
  nativeRecorderMimeType?: string;
}

interface ResolveVideoExportStrategyParams {
  project: VideoProject;
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  config: ResolvedVideoExportConfig;
  sourceBlobCache: Map<string, Blob>;
}

function isFormatCompatibleForDirectCopy(
  sourceExtension: string,
  format: VideoExportFormat
): boolean {
  return (
    (format === "mp4" && sourceExtension === "mp4") ||
    (format === "mov" && sourceExtension === "mov")
  );
}

function resolveDirectSubStrategy(params: {
  plan: DirectVideoExportPlan;
  sourceExtension: string;
  config: ResolvedVideoExportConfig;
}): { subStrategy: DirectVideoExportSubStrategy; reason: string; directCopy: boolean } {
  const { plan, sourceExtension, config } = params;
  const clip = plan.clip;
  const clipEnd = clip.startTime + clip.duration;
  const hasSpeedChange = Math.abs(clip.playbackSpeed - 1) > VIDEO_EXPORT_EPSILON;
  const hasCrop =
    plan.cropX !== 0 ||
    plan.cropY !== 0 ||
    plan.cropWidth !== clip.sourceSize.width ||
    plan.cropHeight !== clip.sourceSize.height;
  const hasTrim =
    config.exportStart > clip.startTime + VIDEO_EXPORT_EPSILON ||
    config.exportEnd < clipEnd - VIDEO_EXPORT_EPSILON ||
    clip.trimIn > VIDEO_EXPORT_EPSILON ||
    clip.trimOut < clip.sourceDuration - VIDEO_EXPORT_EPSILON;
  const hasAudioAdjustments =
    config.includeAudio &&
    plan.includeAudio &&
    Math.abs(plan.audioVolume - 100) > VIDEO_EXPORT_EPSILON;
  const hasAudioTempoChange = config.includeAudio && plan.includeAudio && hasSpeedChange;
  const formatCompatible = isFormatCompatibleForDirectCopy(sourceExtension, config.format);

  const canCopy =
    !hasSpeedChange &&
    !hasCrop &&
    !hasTrim &&
    !hasAudioAdjustments &&
    !hasAudioTempoChange &&
    formatCompatible;

  if (canCopy) {
    return {
      subStrategy: "copy",
      reason: "필터 없이 원본 스트림을 그대로 복사할 수 있습니다.",
      directCopy: true,
    };
  }

  const reasons: string[] = [];
  if (hasSpeedChange) reasons.push("속도 변경");
  if (hasCrop) reasons.push("crop");
  if (hasTrim) reasons.push("trim");
  if (hasAudioAdjustments) reasons.push("오디오 볼륨 변경");
  if (hasAudioTempoChange) reasons.push("오디오 tempo 변경");
  if (!formatCompatible) reasons.push("출력 포맷 비호환");

  return {
    subStrategy: "reencode",
    reason: `재인코딩이 필요한 직접 경로입니다 (${reasons.join(", ")}).`,
    directCopy: false,
  };
}

async function resolveDirectEngine(params: {
  subStrategy: DirectVideoExportSubStrategy;
  plan: DirectVideoExportPlan;
  config: ResolvedVideoExportConfig;
  sourceBlob: Blob;
  sourceExtension: string;
}): Promise<{ engine: DirectVideoExportEngine; reason: string; nativeRecorderMimeType?: string }> {
  const { subStrategy, plan, config, sourceBlob, sourceExtension } = params;
  if (subStrategy === "copy") {
    return {
      engine: "ffmpeg",
      reason: "원본 스트림 복사를 위해 ffmpeg 직접 경로를 사용합니다.",
    };
  }

  const webCodecsSupport = await getWebCodecsDirectExportSupport({
    config,
    sourceBlob,
    sourceExtension,
  });
  if (!webCodecsSupport.supported) {
    console.info("[VideoExport] webcodecs unsupported", {
      reason: webCodecsSupport.reason,
      sourceExtension,
      format: config.format,
    });
  }
  if (webCodecsSupport.supported) {
    return {
      engine: "webcodecs",
      reason: webCodecsSupport.reason,
    };
  }

  const nativeSupport = getNativeRecorderSupport(config, plan);
  if (nativeSupport.supported && nativeSupport.mimeType) {
    return {
      engine: "native-recorder",
      reason: `${nativeSupport.reason} (${config.frameRate}fps MP4)`,
      nativeRecorderMimeType: nativeSupport.mimeType,
    };
  }

  return {
    engine: "ffmpeg",
    reason: `${nativeSupport.reason} ffmpeg 직접 재인코딩을 사용합니다.`,
  };
}

export async function resolveVideoExportStrategy(
  params: ResolveVideoExportStrategyParams
): Promise<ResolvedVideoExportStrategy> {
  const { project, clips, tracks, masksMap, config, sourceBlobCache } = params;
  const directEvaluation = evaluateDirectVideoExportPlan({
    clips,
    tracks,
    masksMap,
    project,
    exportStart: config.exportStart,
    exportEnd: config.exportEnd,
    includeAudio: config.includeAudio,
  });

  if (!directEvaluation.plan) {
    return {
      strategy: "frame-sequence",
      reason: directEvaluation.reason,
      eligibility: {
        directSingleVideo: false,
        directCopy: false,
      },
    };
  }

  const sourceBlob = await resolveClipSourceBlob(directEvaluation.plan.clip, sourceBlobCache);
  const sourceExtension = resolveSourceExtension(
    sourceBlob.type || directEvaluation.plan.clip.sourceUrl
  );
  const copyDecision = resolveDirectSubStrategy({
    plan: directEvaluation.plan,
    sourceExtension,
    config,
  });
  const engineDecision = await resolveDirectEngine({
    sourceBlob,
    sourceExtension,
    subStrategy: copyDecision.subStrategy,
    plan: directEvaluation.plan,
    config,
  });

  return {
    strategy: "direct-single-video",
    subStrategy: copyDecision.subStrategy,
    engine: engineDecision.engine,
    reason: `${copyDecision.reason} ${engineDecision.reason}`.trim(),
    eligibility: {
      directSingleVideo: true,
      directCopy: copyDecision.directCopy,
    },
    directPlan: directEvaluation.plan,
    sourceBlob,
    sourceExtension,
    nativeRecorderMimeType: engineDecision.nativeRecorderMimeType,
  };
}
