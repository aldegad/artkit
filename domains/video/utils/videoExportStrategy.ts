import type { Clip, MaskData, VideoProject, VideoTrack } from "../types";
import {
  evaluateDirectVideoExportPlan,
  VIDEO_EXPORT_EPSILON,
  type DirectVideoExportPlan,
} from "./videoExportHelpers";
import { resolveClipSourceBlob } from "./videoExportIO";
import { getNativeRecorderSupport } from "./videoExportNativeRecorder";
import type {
  ResolvedVideoExportConfig,
  VideoExportStrategyDecision,
} from "./videoExportTypes";

export interface ResolvedVideoExportStrategy extends VideoExportStrategyDecision {
  directPlan?: DirectVideoExportPlan;
  sourceBlob?: Blob;
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

function resolveNativeDirectReason(params: {
  plan: DirectVideoExportPlan;
  config: ResolvedVideoExportConfig;
}): string {
  const { plan, config } = params;
  if (plan.kind === "sequence") {
    return `동일 원본 분할 클립 ${plan.segments.length}개를 네이티브 인코더로 직접 이어서 기록합니다.`;
  }

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
  const hasOverlays = plan.overlays.length > 0;

  const reasons: string[] = [];
  if (hasSpeedChange) reasons.push("속도 변경");
  if (hasCrop) reasons.push("crop");
  if (hasTrim) reasons.push("trim");
  if (hasOverlays) reasons.push(`오버레이 ${plan.overlays.length}개`);
  if (hasAudioAdjustments) reasons.push("오디오 볼륨 변경");
  if (hasAudioTempoChange) reasons.push("오디오 tempo 변경");

  if (reasons.length === 0) {
    return "원본과 거의 동일한 구성이지만 export 경로를 단순화하기 위해 네이티브 인코더로 직접 기록합니다.";
  }

  return `직접 요소(${reasons.join(", ")})를 반영하기 위해 네이티브 인코더로 직접 기록합니다.`;
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

  const nativeSupport = getNativeRecorderSupport(config, directEvaluation.plan ?? null);
  if (!nativeSupport.supported || !nativeSupport.mimeType) {
    throw new Error(nativeSupport.reason);
  }

  if (!directEvaluation.plan) {
    return {
      strategy: "frame-sequence",
      engine: "native-recorder",
      reason: `${directEvaluation.reason} 네이티브 타임라인 recorder로 캔버스를 직접 기록합니다.`,
      eligibility: {
        directSingleVideo: false,
        directCopy: false,
      },
      nativeRecorderMimeType: nativeSupport.mimeType,
    };
  }

  const sourceClip = directEvaluation.plan.kind === "single"
    ? directEvaluation.plan.clip
    : directEvaluation.plan.sourceClip;
  const sourceBlob = await resolveClipSourceBlob(sourceClip, sourceBlobCache);

  return {
    strategy: "direct-single-video",
    subStrategy: "reencode",
    engine: "native-recorder",
    reason: `${resolveNativeDirectReason({
      plan: directEvaluation.plan,
      config,
    })} ${nativeSupport.reason}`.trim(),
    eligibility: {
      directSingleVideo: true,
      directCopy: false,
    },
    directPlan: directEvaluation.plan,
    sourceBlob,
    nativeRecorderMimeType: nativeSupport.mimeType,
  };
}
