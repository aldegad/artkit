"use client";

import { PREVIEW } from "../../constants";
import { Clip, VideoClip, VideoTrack } from "../../types";

export const SAMPLE_FRAME_EPSILON = 1e-6;
export const INPAINT_BRUSH_SIZE = 44;
export const INPAINT_BRUSH_HARDNESS = 80;
export const INPAINT_STROKE_SPACING = Math.max(1, INPAINT_BRUSH_SIZE * 0.35);

export type InpaintBrushMode = "paint" | "erase";

export interface AdaptivePlaybackPreviewPolicy {
  maxCanvasDpr: number;
  playbackRenderFpsCap: number;
  smoothingQuality: ImageSmoothingQuality;
}

export function resolveAdaptivePlaybackPreviewPolicy(params: {
  playbackIsPlaying: boolean;
  qualityFirstMode: boolean;
  clipCount: number;
  visualClipCount: number;
  baseMaxCanvasDpr: number;
  basePlaybackRenderFpsCap: number;
}): AdaptivePlaybackPreviewPolicy {
  const {
    playbackIsPlaying,
    qualityFirstMode,
    clipCount,
    visualClipCount,
    baseMaxCanvasDpr,
    basePlaybackRenderFpsCap,
  } = params;

  if (!playbackIsPlaying || qualityFirstMode) {
    return {
      maxCanvasDpr: baseMaxCanvasDpr,
      playbackRenderFpsCap: basePlaybackRenderFpsCap,
      smoothingQuality: "high",
    };
  }

  const loadScore = Math.max(clipCount, visualClipCount * 1.5);

  if (loadScore >= 24) {
    return { maxCanvasDpr: 1, playbackRenderFpsCap: Math.min(basePlaybackRenderFpsCap, 24), smoothingQuality: "low" };
  }

  if (loadScore >= 12) {
    return { maxCanvasDpr: 1.25, playbackRenderFpsCap: Math.min(basePlaybackRenderFpsCap, 30), smoothingQuality: "medium" };
  }

  if (loadScore >= 6) {
    return {
      maxCanvasDpr: Math.min(baseMaxCanvasDpr, 1.5),
      playbackRenderFpsCap: Math.min(basePlaybackRenderFpsCap, 45),
      smoothingQuality: "medium",
    };
  }

  return {
    maxCanvasDpr: Math.min(baseMaxCanvasDpr, 2),
    playbackRenderFpsCap: basePlaybackRenderFpsCap,
    smoothingQuality: "high",
  };
}

export function ensureRenderSurfaceCanvas(
  canvasRef: { current: HTMLCanvasElement | null },
  pixelWidth: number,
  pixelHeight: number,
): { canvas: HTMLCanvasElement; resized: boolean } {
  let canvas = canvasRef.current;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvasRef.current = canvas;
  }

  const nextWidth = Math.max(1, Math.round(pixelWidth));
  const nextHeight = Math.max(1, Math.round(pixelHeight));
  const resized = canvas.width !== nextWidth || canvas.height !== nextHeight;
  if (resized) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }

  return { canvas, resized };
}

export interface DirectPreviewPlan {
  trackId: string;
}

export function resolveDirectPreviewPlan(
  tracks: VideoTrack[],
  clips: Clip[],
  maskCount: number,
): DirectPreviewPlan | null {
  if (maskCount > 0) return null;

  const visibleVisualTracks = tracks.filter((track) => {
    if (!track.visible || track.type === "audio") return false;
    return clips.some((clip) => clip.trackId === track.id && clip.visible);
  });
  if (visibleVisualTracks.length !== 1) return null;

  const track = visibleVisualTracks[0];
  const trackClips = clips.filter((clip) => clip.trackId === track.id && clip.visible);
  if (trackClips.length === 0) return null;
  if (trackClips.some((clip) => clip.type !== "video")) return null;

  const videoClips = trackClips as VideoClip[];
  const sourceKey = videoClips[0].sourceId || videoClips[0].sourceUrl;
  if (!sourceKey) return null;
  if (videoClips.some((clip) => (clip.sourceId || clip.sourceUrl) !== sourceKey)) {
    return null;
  }

  return { trackId: track.id };
}

export const PREVIEW_VIEWPORT_CONFIG = {
  origin: "center" as const,
  minZoom: PREVIEW.MIN_ZOOM,
  maxZoom: PREVIEW.MAX_ZOOM,
};
