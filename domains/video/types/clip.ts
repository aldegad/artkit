import { Size, Point } from "@/shared/types";
import type { MaskData } from "./mask";

export type PositionKeyframeInterpolation = "linear";

export interface PositionKeyframe {
  id: string;
  time: number; // Local clip time in seconds
  value: Point;
  interpolation: PositionKeyframeInterpolation;
}

export interface ClipTransformKeyframes {
  // Position keyframes (linear interpolation in v1)
  position?: PositionKeyframe[];
}

/**
 * Base clip interface shared by video and image clips
 */
export interface BaseClip {
  id: string;
  name: string;
  trackId: string;

  // Timeline position
  startTime: number; // Position on timeline (seconds)
  duration: number; // Clip duration on timeline (seconds)

  // Source trimming
  trimIn: number; // Start offset in source (seconds)
  trimOut: number; // End offset in source (seconds)
  playbackSpeed: number; // 1 = normal speed, >1 = faster

  // Visual properties
  opacity: number; // 0-100
  visible: boolean;
  locked: boolean;

  // Position/scale within frame (for transform)
  position: Point;
  scale: number;
  // Optional axis-specific scale (defaults to 1 for backward compatibility)
  scaleX?: number;
  scaleY?: number;
  rotation: number;
  transformKeyframes?: ClipTransformKeyframes;
}

/**
 * Video clip with source video reference
 */
export interface VideoClip extends BaseClip {
  type: "video";
  sourceUrl: string;
  sourceId: string;
  sourceDuration: number;
  sourceSize: Size;
  hasAudio: boolean;
  audioMuted: boolean;
  audioVolume: number; // 0-100
}

/**
 * Audio-only clip
 */
export interface AudioClip extends BaseClip {
  type: "audio";
  sourceUrl: string;
  sourceId: string;
  sourceDuration: number;
  sourceSize: Size;
  audioMuted: boolean;
  audioVolume: number; // 0-100
}

/**
 * Image clip (static frame)
 */
export interface ImageClip extends BaseClip {
  type: "image";
  sourceUrl: string;
  sourceId: string;
  sourceSize: Size;
  imageData?: string; // Base64 for persistence
}

export type Clip = VideoClip | AudioClip | ImageClip;

export function getClipScaleX(clip: Clip): number {
  const baseScale = typeof clip.scale === "number" ? clip.scale : 1;
  const axisScale = typeof clip.scaleX === "number" ? clip.scaleX : 1;
  return baseScale * axisScale;
}

export function getClipScaleY(clip: Clip): number {
  const baseScale = typeof clip.scale === "number" ? clip.scale : 1;
  const axisScale = typeof clip.scaleY === "number" ? clip.scaleY : 1;
  return baseScale * axisScale;
}

/**
 * Clipboard data for copy/cut operations
 */
export interface ClipboardData {
  clips: Clip[];
  masks?: MaskData[];
  mode: "copy" | "cut";
  sourceTime: number;
}

/**
 * Create a new video clip
 */
export function createVideoClip(
  trackId: string,
  sourceUrl: string,
  sourceDuration: number,
  sourceSize: Size,
  startTime: number = 0
): VideoClip {
  return {
    id: crypto.randomUUID(),
    name: "Video Clip",
    type: "video",
    trackId,
    startTime,
    duration: sourceDuration,
    trimIn: 0,
    trimOut: sourceDuration,
    playbackSpeed: 1,
    opacity: 100,
    visible: true,
    locked: false,
    position: { x: 0, y: 0 },
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    sourceUrl,
    sourceId: crypto.randomUUID(),
    sourceDuration,
    sourceSize,
    hasAudio: true,
    audioMuted: false,
    audioVolume: 100,
  };
}

/**
 * Create a new audio clip
 */
export function createAudioClip(
  trackId: string,
  sourceUrl: string,
  sourceDuration: number,
  startTime: number = 0,
  sourceSize: Size = { width: 0, height: 0 }
): AudioClip {
  return {
    id: crypto.randomUUID(),
    name: "Audio Clip",
    type: "audio",
    trackId,
    startTime,
    duration: sourceDuration,
    trimIn: 0,
    trimOut: sourceDuration,
    playbackSpeed: 1,
    opacity: 100,
    visible: true,
    locked: false,
    position: { x: 0, y: 0 },
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    sourceUrl,
    sourceId: crypto.randomUUID(),
    sourceDuration,
    sourceSize,
    audioMuted: false,
    audioVolume: 100,
  };
}

/**
 * Create a new image clip
 */
export function createImageClip(
  trackId: string,
  sourceUrl: string,
  sourceSize: Size,
  startTime: number = 0,
  duration: number = 5
): ImageClip {
  return {
    id: crypto.randomUUID(),
    name: "Image Clip",
    type: "image",
    trackId,
    startTime,
    duration,
    trimIn: 0,
    trimOut: duration,
    playbackSpeed: 1,
    opacity: 100,
    visible: true,
    locked: false,
    position: { x: 0, y: 0 },
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    sourceUrl,
    sourceId: crypto.randomUUID(),
    sourceSize,
  };
}

/**
 * Get the source time for a given timeline time
 */
export function getClipPlaybackSpeed(
  clip: Pick<BaseClip, "playbackSpeed">
): number {
  const speed = clip.playbackSpeed;
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

export function getClipSourceSpan(
  clip: Pick<BaseClip, "trimIn" | "trimOut">
): number {
  const trimIn = Number.isFinite(clip.trimIn) ? clip.trimIn : 0;
  const trimOut = Number.isFinite(clip.trimOut) ? clip.trimOut : trimIn;
  return Math.max(0, trimOut - trimIn);
}

export function getSourceDurationForTimelineDuration(
  clip: Pick<BaseClip, "playbackSpeed">,
  timelineDuration: number
): number {
  const safeDuration = Number.isFinite(timelineDuration) ? Math.max(0, timelineDuration) : 0;
  return safeDuration * getClipPlaybackSpeed(clip);
}

export function getTimelineDurationForSourceDuration(
  clip: Pick<BaseClip, "playbackSpeed">,
  sourceDuration: number
): number {
  const safeDuration = Number.isFinite(sourceDuration) ? Math.max(0, sourceDuration) : 0;
  return safeDuration / getClipPlaybackSpeed(clip);
}

export function getSourceTimeAtClipLocalTime(
  clip: Pick<BaseClip, "trimIn" | "trimOut" | "duration" | "playbackSpeed">,
  clipLocalTime: number
): number {
  const safeDuration = Number.isFinite(clip.duration) ? Math.max(0, clip.duration) : 0;
  const safeLocalTime = Number.isFinite(clipLocalTime)
    ? Math.max(0, Math.min(clipLocalTime, safeDuration))
    : 0;
  const sourceTime = clip.trimIn + (safeLocalTime * getClipPlaybackSpeed(clip));
  return Math.max(clip.trimIn, Math.min(sourceTime, Math.max(clip.trimIn, clip.trimOut)));
}

export function getSourceTime(clip: Clip, timelineTime: number): number {
  const clipTime = timelineTime - clip.startTime;
  return getSourceTimeAtClipLocalTime(clip, clipTime);
}

/**
 * Check if a timeline time falls within a clip
 */
export function isTimeInClip(clip: Clip, time: number): boolean {
  return time >= clip.startTime && time < clip.startTime + clip.duration;
}
