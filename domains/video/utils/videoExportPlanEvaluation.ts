import {
  getClipScaleX,
  getClipScaleY,
  getSourceDurationForTimelineDuration,
  getSourceTime,
  type Clip,
  type ImageClip,
  type MaskData,
  type VideoClip,
  type VideoProject,
  type VideoTrack,
} from "../types";
import { getTimelineFrameRange, normalizeTimelineFrameRate } from "./timelineFrame";
import type {
  DirectVideoExportPlanEvaluation,
  DirectVideoOverlayPlan,
  DirectVideoSequenceSegmentPlan,
} from "./videoExportCommon";
import { VIDEO_EXPORT_EPSILON } from "./videoExportCommon";

function fail(reason: string): DirectVideoExportPlanEvaluation {
  return { plan: null, reason };
}

function resolveVisibleVideoWindow(params: {
  clip: VideoClip;
  project: VideoProject;
}): {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  outputWidth: number;
  outputHeight: number;
  padX: number;
  padY: number;
} | null {
  const { clip, project } = params;
  const projectWidth = project.canvasSize.width;
  const projectHeight = project.canvasSize.height;
  const sourceWidth = clip.sourceSize.width;
  const sourceHeight = clip.sourceSize.height;
  const positionX = clip.position.x;
  const positionY = clip.position.y;

  if (
    !Number.isFinite(projectWidth) ||
    !Number.isFinite(projectHeight) ||
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    !Number.isFinite(positionX) ||
    !Number.isFinite(positionY)
  ) {
    return null;
  }

  const visibleLeft = Math.max(positionX, 0);
  const visibleTop = Math.max(positionY, 0);
  const visibleRight = Math.min(positionX + sourceWidth, projectWidth);
  const visibleBottom = Math.min(positionY + sourceHeight, projectHeight);
  const visibleWidth = visibleRight - visibleLeft;
  const visibleHeight = visibleBottom - visibleTop;

  if (visibleWidth <= VIDEO_EXPORT_EPSILON || visibleHeight <= VIDEO_EXPORT_EPSILON) {
    return null;
  }

  return {
    cropX: Math.max(0, -positionX),
    cropY: Math.max(0, -positionY),
    cropWidth: visibleWidth,
    cropHeight: visibleHeight,
    outputWidth: projectWidth,
    outputHeight: projectHeight,
    padX: visibleLeft,
    padY: visibleTop,
  };
}

export function evaluateDirectVideoExportPlan(params: {
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  project: VideoProject;
  exportStart: number;
  exportEnd: number;
  includeAudio: boolean;
}): DirectVideoExportPlanEvaluation {
  const { clips, tracks, masksMap, project, exportStart, exportEnd, includeAudio } = params;

  const relevantClips = clips.filter((candidate) => {
    if (!candidate.visible) return false;
    const candidateEnd = candidate.startTime + candidate.duration;
    return candidateEnd > exportStart + VIDEO_EXPORT_EPSILON
      && candidate.startTime < exportEnd - VIDEO_EXPORT_EPSILON;
  });

  if (relevantClips.length === 0) {
    return fail("내보내기 구간에 렌더할 클립이 없습니다.");
  }

  const videoClips = relevantClips.filter((candidate): candidate is VideoClip => candidate.type === "video");
  const imageClips = relevantClips.filter((candidate): candidate is ImageClip => candidate.type === "image");
  const audioOnlyClips = relevantClips.filter((candidate) => candidate.type === "audio");

  if (audioOnlyClips.length > 0) {
    return fail("별도 오디오 클립이 있어 일반 렌더 경로가 필요합니다.");
  }

  if (videoClips.length !== 1) {
    return evaluateSameSourceSequenceExportPlan({
      videoClips,
      imageClips,
      tracks,
      masksMap,
      project,
      exportStart,
      exportEnd,
      includeAudio,
    });
  }

  const clip = videoClips[0];
  const track = tracks.find((candidate) => candidate.id === clip.trackId);
  if (!track || !track.visible) {
    return fail("클립 트랙이 숨김 상태라 직접 경로를 사용할 수 없습니다.");
  }

  if (imageClips.some((candidate) => !candidate.visible)) {
    return fail("숨김 이미지 클립이 있어 일반 렌더 경로가 필요합니다.");
  }

  if (Array.from(masksMap.values()).some((mask) => Boolean(mask.maskData))) {
    return fail("마스크가 있어서 일반 렌더 경로가 필요합니다.");
  }
  if ((clip.transformKeyframes?.position?.length ?? 0) > 0) {
    return fail("위치 키프레임이 있어서 일반 렌더 경로가 필요합니다.");
  }
  if (Math.abs(clip.rotation) > VIDEO_EXPORT_EPSILON) {
    return fail("회전이 적용되어 직접 경로를 사용할 수 없습니다.");
  }
  if (Math.abs(clip.opacity - 100) > VIDEO_EXPORT_EPSILON) {
    return fail("불투명도 변경이 있어서 일반 렌더 경로가 필요합니다.");
  }

  const scaleX = getClipScaleX(clip);
  const scaleY = getClipScaleY(clip);
  if (Math.abs(scaleX - 1) > VIDEO_EXPORT_EPSILON || Math.abs(scaleY - 1) > VIDEO_EXPORT_EPSILON) {
    return fail("스케일 변경이 있어서 일반 렌더 경로가 필요합니다.");
  }

  const clipEnd = clip.startTime + clip.duration;
  if (exportStart < clip.startTime - VIDEO_EXPORT_EPSILON || exportEnd > clipEnd + VIDEO_EXPORT_EPSILON) {
    return fail("내보내기 범위가 단일 클립 밖까지 걸쳐 있습니다.");
  }

  const visibleWindow = resolveVisibleVideoWindow({ clip, project });
  if (!visibleWindow) {
    return fail("비디오가 캔버스에 보이는 영역이 없어 직접 경로를 사용할 수 없습니다.");
  }

  const sourceStart = getSourceTime(clip, exportStart);
  const sourceDuration = getSourceDurationForTimelineDuration(clip, exportEnd - exportStart);
  if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    return fail("원본 비디오 구간 계산에 실패했습니다.");
  }

  const audioVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
  const videoTrackZIndex = track.zIndex;
  const overlays: DirectVideoOverlayPlan[] = [];

  for (const overlayClip of imageClips) {
    const overlayTrack = tracks.find((candidate) => candidate.id === overlayClip.trackId) || null;
    if (!overlayTrack || !overlayTrack.visible) {
      return fail("오버레이 트랙이 숨김 상태라 일반 렌더 경로가 필요합니다.");
    }

    if (overlayTrack.zIndex <= videoTrackZIndex) {
      return fail("비디오 아래쪽 레이어가 있어 일반 렌더 경로가 필요합니다.");
    }

    if ((overlayClip.transformKeyframes?.position?.length ?? 0) > 0) {
      return fail("오버레이 위치 키프레임이 있어 일반 렌더 경로가 필요합니다.");
    }

    if (Math.abs(overlayClip.rotation) > VIDEO_EXPORT_EPSILON) {
      return fail("오버레이 회전이 있어 일반 렌더 경로가 필요합니다.");
    }

    const overlayScaleX = getClipScaleX(overlayClip);
    const overlayScaleY = getClipScaleY(overlayClip);
    if (
      !Number.isFinite(overlayScaleX) ||
      !Number.isFinite(overlayScaleY) ||
      overlayScaleX <= VIDEO_EXPORT_EPSILON ||
      overlayScaleY <= VIDEO_EXPORT_EPSILON
    ) {
      return fail("오버레이 스케일을 계산할 수 없어 일반 렌더 경로가 필요합니다.");
    }

    const overlayWidth = overlayClip.sourceSize.width * overlayScaleX;
    const overlayHeight = overlayClip.sourceSize.height * overlayScaleY;
    if (
      !Number.isFinite(overlayWidth) ||
      !Number.isFinite(overlayHeight) ||
      overlayWidth <= VIDEO_EXPORT_EPSILON ||
      overlayHeight <= VIDEO_EXPORT_EPSILON
    ) {
      return fail("오버레이 크기를 계산할 수 없어 일반 렌더 경로가 필요합니다.");
    }

    const offsetX = overlayClip.position.x;
    const offsetY = overlayClip.position.y;
    if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
      return fail("오버레이 위치를 계산할 수 없어 직접 합성 경로를 사용할 수 없습니다.");
    }

    const isOutsideCanvas =
      offsetX + overlayWidth <= VIDEO_EXPORT_EPSILON ||
      offsetY + overlayHeight <= VIDEO_EXPORT_EPSILON ||
      offsetX >= project.canvasSize.width - VIDEO_EXPORT_EPSILON ||
      offsetY >= project.canvasSize.height - VIDEO_EXPORT_EPSILON;
    if (isOutsideCanvas) {
      continue;
    }

    const opacity = typeof overlayClip.opacity === "number" ? overlayClip.opacity : 100;
    if (opacity <= VIDEO_EXPORT_EPSILON) {
      continue;
    }

    const overlayStart = Math.max(0, overlayClip.startTime - exportStart);
    const overlayEnd = Math.min(exportEnd - exportStart, overlayClip.startTime + overlayClip.duration - exportStart);
    if (overlayEnd <= overlayStart + VIDEO_EXPORT_EPSILON) {
      continue;
    }

    overlays.push({
      clip: overlayClip,
      offsetX,
      offsetY,
      width: overlayWidth,
      height: overlayHeight,
      sourceWidth: overlayClip.sourceSize.width,
      sourceHeight: overlayClip.sourceSize.height,
      opacity,
      startTime: overlayStart,
      endTime: overlayEnd,
    });
  }

  overlays.sort((a, b) => {
    const trackA = tracks.find((candidate) => candidate.id === a.clip.trackId)?.zIndex ?? 0;
    const trackB = tracks.find((candidate) => candidate.id === b.clip.trackId)?.zIndex ?? 0;
    return trackA - trackB;
  });

  return {
    plan: {
      kind: "single",
      clip,
      cropX: visibleWindow.cropX,
      cropY: visibleWindow.cropY,
      cropWidth: visibleWindow.cropWidth,
      cropHeight: visibleWindow.cropHeight,
      outputWidth: visibleWindow.outputWidth,
      outputHeight: visibleWindow.outputHeight,
      padX: visibleWindow.padX,
      padY: visibleWindow.padY,
      sourceStart,
      sourceDuration,
      includeAudio:
        includeAudio &&
        clip.hasAudio !== false &&
        !(clip.audioMuted ?? false) &&
        audioVolume > 0,
      audioVolume,
      overlays,
    },
    reason: overlays.length > 0
      ? `단일 영상 + 오버레이 ${overlays.length}개 직접 합성 경로를 사용할 수 있습니다.`
      : "단일 영상 직접 인코딩 경로를 사용할 수 있습니다.",
  };
}

function evaluateSameSourceSequenceExportPlan(params: {
  videoClips: VideoClip[];
  imageClips: ImageClip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  project: VideoProject;
  exportStart: number;
  exportEnd: number;
  includeAudio: boolean;
}): DirectVideoExportPlanEvaluation {
  const { videoClips, imageClips, tracks, masksMap, project, exportStart, exportEnd, includeAudio } = params;
  const frameRate = normalizeTimelineFrameRate(project.frameRate || 30);
  const exportFrameRange = getTimelineFrameRange(exportStart, exportEnd - exportStart, frameRate);

  if (videoClips.length < 2) {
    return fail("내보내기 구간에 단일 영상 클립이 아니어서 직접 경로를 사용할 수 없습니다.");
  }

  if (imageClips.length > 0) {
    return fail("이미지 오버레이가 있어 일반 렌더 경로가 필요합니다.");
  }

  if (Array.from(masksMap.values()).some((mask) => Boolean(mask.maskData))) {
    return fail("마스크가 있어서 일반 렌더 경로가 필요합니다.");
  }

  const trackId = videoClips[0].trackId;
  if (videoClips.some((clip) => clip.trackId !== trackId)) {
    return fail("여러 비디오 트랙이 섞여 있어 일반 렌더 경로가 필요합니다.");
  }

  const track = tracks.find((candidate) => candidate.id === trackId);
  if (!track || !track.visible) {
    return fail("클립 트랙이 숨김 상태라 직접 경로를 사용할 수 없습니다.");
  }

  const sourceKey = videoClips[0].sourceId || videoClips[0].sourceUrl;
  if (videoClips.some((clip) => (clip.sourceId || clip.sourceUrl) !== sourceKey)) {
    return fail("여러 원본 비디오가 섞여 있어 직접 경로를 사용할 수 없습니다.");
  }

  const sortedClips = [...videoClips].sort((a, b) => a.startTime - b.startTime);
  const segments: DirectVideoSequenceSegmentPlan[] = [];
  let coveredUntilFrame = exportFrameRange.startFrame;

  for (const clip of sortedClips) {
    const clipStart = Math.max(clip.startTime, exportStart);
    const clipEnd = Math.min(clip.startTime + clip.duration, exportEnd);
    const timelineDuration = clipEnd - clipStart;
    if (timelineDuration <= VIDEO_EXPORT_EPSILON) continue;
    const clipFrameRange = getTimelineFrameRange(clipStart, timelineDuration, frameRate);

    if (clipFrameRange.startFrame > coveredUntilFrame) {
      return fail("클립 사이에 빈 구간이 있어 일반 렌더 경로가 필요합니다.");
    }

    if (clipFrameRange.startFrame < coveredUntilFrame) {
      return fail("겹치는 클립이 있어 직접 경로를 사용할 수 없습니다.");
    }

    if ((clip.transformKeyframes?.position?.length ?? 0) > 0) {
      return fail("위치 키프레임이 있어 일반 렌더 경로가 필요합니다.");
    }
    if (Math.abs(clip.rotation) > VIDEO_EXPORT_EPSILON) {
      return fail("회전이 적용되어 직접 경로를 사용할 수 없습니다.");
    }
    if (Math.abs(clip.opacity - 100) > VIDEO_EXPORT_EPSILON) {
      return fail("불투명도 변경이 있어 일반 렌더 경로가 필요합니다.");
    }

    const scaleX = getClipScaleX(clip);
    const scaleY = getClipScaleY(clip);
    if (Math.abs(scaleX - 1) > VIDEO_EXPORT_EPSILON || Math.abs(scaleY - 1) > VIDEO_EXPORT_EPSILON) {
      return fail("스케일 변경이 있어 일반 렌더 경로가 필요합니다.");
    }

    const visibleWindow = resolveVisibleVideoWindow({ clip, project });
    if (!visibleWindow) {
      return fail("비디오가 캔버스에 보이는 영역이 없어 직접 경로를 사용할 수 없습니다.");
    }

    const quantizedClipStart = Math.max(exportStart, clipFrameRange.startTime);
    const quantizedTimelineDuration = clipFrameRange.duration;
    const sourceStart = getSourceTime(clip, quantizedClipStart);
    const sourceDuration = getSourceDurationForTimelineDuration(clip, quantizedTimelineDuration);
    if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceDuration) || sourceDuration <= 0) {
      return fail("원본 비디오 구간 계산에 실패했습니다.");
    }

    const audioVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
    segments.push({
      clip,
      cropX: visibleWindow.cropX,
      cropY: visibleWindow.cropY,
      cropWidth: visibleWindow.cropWidth,
      cropHeight: visibleWindow.cropHeight,
      padX: visibleWindow.padX,
      padY: visibleWindow.padY,
      sourceStart,
      sourceDuration,
      timelineDuration: quantizedTimelineDuration,
      includeAudio:
        includeAudio &&
        clip.hasAudio !== false &&
        !(clip.audioMuted ?? false) &&
        audioVolume > VIDEO_EXPORT_EPSILON,
      audioVolume,
    });
    coveredUntilFrame = clipFrameRange.endFrame;
  }

  if (segments.length === 0) {
    return fail("내보내기 구간에 렌더할 클립이 없습니다.");
  }

  if (coveredUntilFrame < exportFrameRange.endFrame) {
    return fail("클립 사이에 빈 구간이 있어 일반 렌더 경로가 필요합니다.");
  }

  return {
    plan: {
      kind: "sequence",
      sourceClip: sortedClips[0],
      segments,
      outputWidth: project.canvasSize.width,
      outputHeight: project.canvasSize.height,
      includeAudio: includeAudio && segments.some((segment) => segment.includeAudio),
    },
    reason: `동일 원본 비디오 분할 클립 ${segments.length}개를 직접 경로로 이어서 내보낼 수 있습니다.`,
  };
}
