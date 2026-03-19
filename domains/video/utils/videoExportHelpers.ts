import {
  getClipPlaybackSpeed,
  getClipScaleX,
  getClipScaleY,
  getSourceDurationForTimelineDuration,
  getSourceTime,
  type Clip,
  type ImageClip,
  type MaskData,
  type PlaybackState,
  type VideoClip,
  type VideoProject,
  type VideoTrack,
} from "../types";
import type {
  ResolvedVideoExportConfig,
  VideoExportCompression,
  VideoExportCompressionSettings,
  VideoExportOptions,
} from "./videoExportTypes";
import { resolveClipSourceBlob } from "./videoExportIO";

export interface DirectVideoExportPlan {
  clip: VideoClip;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  sourceStart: number;
  sourceDuration: number;
  includeAudio: boolean;
  audioVolume: number;
  overlays: DirectVideoOverlayPlan[];
}

export interface DirectVideoOverlayPlan {
  clip: ImageClip;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  opacity: number;
  startTime: number;
  endTime: number;
}

export interface DirectVideoExportPlanEvaluation {
  plan: DirectVideoExportPlan | null;
  reason: string;
}

export const VIDEO_EXPORT_EPSILON = 1e-3;

export function sanitizeVideoExportFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9-_ ]+/g, "").replace(/\s+/g, "-") || "untitled-project";
}

export function normalizeVideoExportBackgroundColor(input?: string): string {
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

export function resolveVideoExportCompression(
  compression: VideoExportCompression
): VideoExportCompressionSettings {
  switch (compression) {
    case "high":
      return { crf: 14, preset: "slow" };
    case "small":
      return { crf: 24, preset: "slow" };
    case "balanced":
    default:
      return { crf: 18, preset: "medium" };
  }
}

export function resolveVideoExportConfig(params: {
  project: VideoProject;
  playback: PlaybackState;
  options?: VideoExportOptions;
}): ResolvedVideoExportConfig {
  const { project, playback, options } = params;
  const format = options?.format ?? "mp4";
  const includeAudio = options?.includeAudio ?? true;
  const compression = options?.compression ?? "balanced";
  const backgroundColor = normalizeVideoExportBackgroundColor(options?.backgroundColor);

  const fullDuration = Math.max(project.duration, 0.1);
  const rangeStart = Math.max(0, Math.min(playback.loopStart, fullDuration));
  const hasRange = playback.loopEnd > rangeStart + 0.001;
  const rangeEnd = hasRange
    ? Math.max(rangeStart + 0.001, Math.min(playback.loopEnd, fullDuration))
    : fullDuration;
  const hasCustomRange = hasRange && (rangeStart > 0.001 || rangeEnd < fullDuration - 0.001);
  const exportStart = hasCustomRange ? rangeStart : 0;
  const exportEnd = hasCustomRange ? rangeEnd : fullDuration;

  return {
    format,
    includeAudio,
    compression,
    backgroundColor,
    compressionSettings: resolveVideoExportCompression(compression),
    exportStart,
    exportEnd,
    duration: Math.max(exportEnd - exportStart, 0.1),
    frameRate: Math.max(1, project.frameRate || 30),
    hasCustomRange,
    outputMimeType: format === "mov" ? "video/quicktime" : "video/mp4",
  };
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("failed to capture canvas frame"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
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

export function findActiveClipAtTime(trackClips: Clip[], time: number): Clip | null {
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

export function findActiveMaskAtTime(
  trackMasks: Array<{ startTime: number; endTime: number; maskData: string }>,
  time: number
): string | null {
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

export function resolveSourceExtension(input?: string): string {
  if (!input) return "mp4";
  const lower = input.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("quicktime") || lower.includes("mov")) return "mov";
  if (lower.includes("ogg")) return "ogv";
  return "mp4";
}

export function buildAtempoFilters(playbackSpeed: number): string[] {
  const filters: string[] = [];
  let remaining = playbackSpeed;

  while (remaining > 2 + VIDEO_EXPORT_EPSILON) {
    filters.push("atempo=2");
    remaining /= 2;
  }

  while (remaining < 0.5 - VIDEO_EXPORT_EPSILON) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }

  if (Math.abs(remaining - 1) > VIDEO_EXPORT_EPSILON) {
    filters.push(`atempo=${remaining.toFixed(6)}`);
  }

  return filters;
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
    return {
      plan: null,
      reason: "내보내기 구간에 렌더할 클립이 없습니다.",
    };
  }

  const videoClips = relevantClips.filter((candidate): candidate is VideoClip => candidate.type === "video");
  const imageClips = relevantClips.filter((candidate): candidate is ImageClip => candidate.type === "image");
  const audioOnlyClips = relevantClips.filter((candidate) => candidate.type === "audio");

  if (audioOnlyClips.length > 0) {
    return {
      plan: null,
      reason: "별도 오디오 클립이 있어 일반 렌더 경로가 필요합니다.",
    };
  }

  if (videoClips.length !== 1) {
    return {
      plan: null,
      reason: "내보내기 구간에 단일 영상 클립이 아니어서 직접 경로를 사용할 수 없습니다.",
    };
  }

  const clip = videoClips[0];
  const track = tracks.find((candidate) => candidate.id === clip.trackId);
  if (!track || !track.visible) {
    return {
      plan: null,
      reason: "클립 트랙이 숨김 상태라 직접 경로를 사용할 수 없습니다.",
    };
  }

  if (imageClips.some((candidate) => !candidate.visible)) {
    return {
      plan: null,
      reason: "숨김 이미지 클립이 있어 일반 렌더 경로가 필요합니다.",
    };
  }

  if (Array.from(masksMap.values()).some((mask) => Boolean(mask.maskData))) {
    return {
      plan: null,
      reason: "마스크가 있어서 일반 렌더 경로가 필요합니다.",
    };
  }
  if ((clip.transformKeyframes?.position?.length ?? 0) > 0) {
    return {
      plan: null,
      reason: "위치 키프레임이 있어서 일반 렌더 경로가 필요합니다.",
    };
  }
  if (Math.abs(clip.rotation) > VIDEO_EXPORT_EPSILON) {
    return {
      plan: null,
      reason: "회전이 적용되어 직접 경로를 사용할 수 없습니다.",
    };
  }
  if (Math.abs(clip.opacity - 100) > VIDEO_EXPORT_EPSILON) {
    return {
      plan: null,
      reason: "불투명도 변경이 있어서 일반 렌더 경로가 필요합니다.",
    };
  }

  const scaleX = getClipScaleX(clip);
  const scaleY = getClipScaleY(clip);
  if (Math.abs(scaleX - 1) > VIDEO_EXPORT_EPSILON || Math.abs(scaleY - 1) > VIDEO_EXPORT_EPSILON) {
    return {
      plan: null,
      reason: "스케일 변경이 있어서 일반 렌더 경로가 필요합니다.",
    };
  }

  const clipEnd = clip.startTime + clip.duration;
  if (exportStart < clip.startTime - VIDEO_EXPORT_EPSILON || exportEnd > clipEnd + VIDEO_EXPORT_EPSILON) {
    return {
      plan: null,
      reason: "내보내기 범위가 단일 클립 밖까지 걸쳐 있습니다.",
    };
  }

  const cropX = -clip.position.x;
  const cropY = -clip.position.y;
  const cropWidth = project.canvasSize.width;
  const cropHeight = project.canvasSize.height;
  if (
    !Number.isFinite(cropX) ||
    !Number.isFinite(cropY) ||
    !Number.isFinite(cropWidth) ||
    !Number.isFinite(cropHeight) ||
    cropX < 0 ||
    cropY < 0 ||
    cropWidth <= 0 ||
    cropHeight <= 0
  ) {
    return {
      plan: null,
      reason: "crop 영역을 계산할 수 없어서 직접 경로를 사용할 수 없습니다.",
    };
  }

  if (cropX + cropWidth > clip.sourceSize.width || cropY + cropHeight > clip.sourceSize.height) {
    return {
      plan: null,
      reason: "캔버스 범위가 원본 비디오 바깥으로 나가 직접 경로를 사용할 수 없습니다.",
    };
  }

  const sourceStart = getSourceTime(clip, exportStart);
  const sourceDuration = getSourceDurationForTimelineDuration(clip, exportEnd - exportStart);
  if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    return {
      plan: null,
      reason: "원본 비디오 구간 계산에 실패했습니다.",
    };
  }

  const audioVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
  const videoTrackZIndex = track.zIndex;
  const overlays: DirectVideoOverlayPlan[] = [];

  for (const overlayClip of imageClips) {
    const overlayTrack = tracks.find((candidate) => candidate.id === overlayClip.trackId) || null;
    if (!overlayTrack || !overlayTrack.visible) {
      return {
        plan: null,
        reason: "오버레이 트랙이 숨김 상태라 일반 렌더 경로가 필요합니다.",
      };
    }

    if (overlayTrack.zIndex <= videoTrackZIndex) {
      return {
        plan: null,
        reason: "비디오 아래쪽 레이어가 있어 일반 렌더 경로가 필요합니다.",
      };
    }

    if ((overlayClip.transformKeyframes?.position?.length ?? 0) > 0) {
      return {
        plan: null,
        reason: "오버레이 위치 키프레임이 있어 일반 렌더 경로가 필요합니다.",
      };
    }

    if (Math.abs(overlayClip.rotation) > VIDEO_EXPORT_EPSILON) {
      return {
        plan: null,
        reason: "오버레이 회전이 있어 일반 렌더 경로가 필요합니다.",
      };
    }

    const overlayScaleX = getClipScaleX(overlayClip);
    const overlayScaleY = getClipScaleY(overlayClip);
    if (
      !Number.isFinite(overlayScaleX) ||
      !Number.isFinite(overlayScaleY) ||
      overlayScaleX <= VIDEO_EXPORT_EPSILON ||
      overlayScaleY <= VIDEO_EXPORT_EPSILON
    ) {
      return {
        plan: null,
        reason: "오버레이 스케일을 계산할 수 없어 일반 렌더 경로가 필요합니다.",
      };
    }

    const overlayWidth = overlayClip.sourceSize.width * overlayScaleX;
    const overlayHeight = overlayClip.sourceSize.height * overlayScaleY;
    if (
      !Number.isFinite(overlayWidth) ||
      !Number.isFinite(overlayHeight) ||
      overlayWidth <= VIDEO_EXPORT_EPSILON ||
      overlayHeight <= VIDEO_EXPORT_EPSILON
    ) {
      return {
        plan: null,
        reason: "오버레이 크기를 계산할 수 없어 일반 렌더 경로가 필요합니다.",
      };
    }

    const offsetX = overlayClip.position.x;
    const offsetY = overlayClip.position.y;
    if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
      return {
        plan: null,
        reason: "오버레이 위치를 계산할 수 없어 직접 합성 경로를 사용할 수 없습니다.",
      };
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
      overlays,
    },
    reason: overlays.length > 0
      ? `단일 영상 + 오버레이 ${overlays.length}개 직접 합성 경로를 사용할 수 있습니다.`
      : "단일 영상 직접 인코딩 경로를 사용할 수 있습니다.",
  };
}

export async function renderTimelineAudioBuffer(params: {
  clips: Clip[];
  tracks: VideoTrack[];
  timelineStart: number;
  projectDuration: number;
  sourceBufferCache: Map<string, AudioBuffer | null>;
  sourceBlobCache?: Map<string, Blob>;
}): Promise<AudioBuffer | null> {
  const { clips, tracks, timelineStart, projectDuration, sourceBufferCache, sourceBlobCache } = params;
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

      const sourceCacheKey = clip.sourceId || clip.id;
      let sourceBuffer = sourceBufferCache.get(sourceCacheKey);
      if (sourceBuffer === undefined) {
        try {
          const sourceBlob = await resolveClipSourceBlob(clip, sourceBlobCache);
          const sourceArrayBuffer = await sourceBlob.arrayBuffer();
          sourceBuffer = await decodeContext.decodeAudioData(sourceArrayBuffer.slice(0));
        } catch {
          sourceBuffer = null;
        }
        sourceBufferCache.set(sourceCacheKey, sourceBuffer);
      }

      if (!sourceBuffer) continue;

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
      sourceNode.playbackRate.value = getClipPlaybackSpeed(clip);
      const gainNode = offlineContext.createGain();
      gainNode.gain.value = Math.max(0, Math.min(1, clipVolume / 100));

      sourceNode.connect(gainNode);
      gainNode.connect(offlineContext.destination);
      sourceNode.start(clipStartTimeInTimeline - timelineStart, trimIn, playbackDuration);
      hasScheduledAudio = true;
    }

    return hasScheduledAudio ? offlineContext.startRendering() : null;
  } finally {
    await decodeContext.close().catch(() => {});
  }
}
