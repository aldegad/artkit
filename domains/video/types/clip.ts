import { Size, Point } from "@/shared/types";

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

  // Visual properties
  opacity: number; // 0-100
  visible: boolean;
  locked: boolean;

  // Mask reference
  maskId: string | null;

  // Position/scale within frame (for transform)
  position: Point;
  scale: number;
  rotation: number;
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
 * Image clip (static frame)
 */
export interface ImageClip extends BaseClip {
  type: "image";
  sourceUrl: string;
  sourceId: string;
  sourceSize: Size;
  imageData?: string; // Base64 for persistence
}

export type Clip = VideoClip | ImageClip;

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
    opacity: 100,
    visible: true,
    locked: false,
    maskId: null,
    position: { x: 0, y: 0 },
    scale: 1,
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
    opacity: 100,
    visible: true,
    locked: false,
    maskId: null,
    position: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    sourceUrl,
    sourceId: crypto.randomUUID(),
    sourceSize,
  };
}

/**
 * Get the source time for a given timeline time
 */
export function getSourceTime(clip: Clip, timelineTime: number): number {
  const clipTime = timelineTime - clip.startTime;
  return clip.trimIn + clipTime;
}

/**
 * Check if a timeline time falls within a clip
 */
export function isTimeInClip(clip: Clip, time: number): boolean {
  return time >= clip.startTime && time < clip.startTime + clip.duration;
}
