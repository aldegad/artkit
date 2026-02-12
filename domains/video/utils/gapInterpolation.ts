"use client";

import { createImageClip, type Clip } from "../types";
import { saveMediaBlob } from "./mediaStorage";

export const VIDEO_GAP_INTERPOLATION_MAX_STEPS = 180;
const VIDEO_GAP_INTERPOLATION_MIN_GAP = 0.0001;
const VIDEO_SEEK_EPSILON = 1 / 600;

export type GapInterpolationIssue =
  | "select_two_visual_clips"
  | "same_track_required"
  | "gap_required"
  | "gap_blocked";

export interface GapInterpolationAnalysis {
  ready: boolean;
  issue?: GapInterpolationIssue;
  firstClip?: Clip;
  secondClip?: Clip;
  gapDuration: number;
  suggestedSteps: number;
}

interface FrameSnapshot {
  dataUrl: string;
  size: { width: number; height: number };
}

interface GapInterpolationClipBuildOptions {
  generatedFrames: string[];
  firstClip: Clip;
  secondClip: Clip;
  gapDuration: number;
  outputSize: { width: number; height: number };
}

interface GapInterpolationClipBuildResult {
  createdClips: Clip[];
  persistTasks: Promise<void>[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateGapInterpolationSteps(gapDuration: number, frameRate: number): number {
  const fps = Math.max(1, Math.round(frameRate || 30));
  const estimated = Math.round(gapDuration * fps);
  return Math.max(1, Math.min(VIDEO_GAP_INTERPOLATION_MAX_STEPS, estimated));
}

export function analyzeGapInterpolationSelection(
  clips: Clip[],
  selectedClipIds: string[],
  frameRate: number,
): GapInterpolationAnalysis {
  const selectedVisual = clips
    .filter((clip) => selectedClipIds.includes(clip.id) && clip.type !== "audio")
    .sort((a, b) => a.startTime - b.startTime);

  if (selectedVisual.length !== 2) {
    return { ready: false, issue: "select_two_visual_clips", gapDuration: 0, suggestedSteps: 0 };
  }

  const [firstClip, secondClip] = selectedVisual;
  if (firstClip.trackId !== secondClip.trackId) {
    return {
      ready: false,
      issue: "same_track_required",
      firstClip,
      secondClip,
      gapDuration: 0,
      suggestedSteps: 0,
    };
  }

  const firstEnd = firstClip.startTime + firstClip.duration;
  const gapDuration = secondClip.startTime - firstEnd;
  if (gapDuration <= VIDEO_GAP_INTERPOLATION_MIN_GAP) {
    return {
      ready: false,
      issue: "gap_required",
      firstClip,
      secondClip,
      gapDuration,
      suggestedSteps: 0,
    };
  }

  const selectedSet = new Set(selectedVisual.map((clip) => clip.id));
  const hasBlockingClip = clips.some((clip) => {
    if (clip.trackId !== firstClip.trackId) return false;
    if (selectedSet.has(clip.id)) return false;
    const clipEnd = clip.startTime + clip.duration;
    return clip.startTime < secondClip.startTime && clipEnd > firstEnd;
  });

  if (hasBlockingClip) {
    return {
      ready: false,
      issue: "gap_blocked",
      firstClip,
      secondClip,
      gapDuration,
      suggestedSteps: 0,
    };
  }

  return {
    ready: true,
    firstClip,
    secondClip,
    gapDuration,
    suggestedSteps: estimateGapInterpolationSteps(gapDuration, frameRate),
  };
}

export function getGapInterpolationIssueMessage(issue?: GapInterpolationIssue): string {
  switch (issue) {
    case "same_track_required":
      return "Select 2 clips on the same track.";
    case "gap_required":
      return "No empty gap between selected clips.";
    case "gap_blocked":
      return "The gap is occupied by another clip.";
    default:
      return "Select exactly 2 visual clips for interpolation.";
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Failed to convert generated frame to blob.");
  }
  return response.blob();
}

export async function buildGapInterpolationClips(
  options: GapInterpolationClipBuildOptions
): Promise<GapInterpolationClipBuildResult> {
  const { generatedFrames, firstClip, secondClip, gapDuration, outputSize } = options;
  const createdClips: Clip[] = [];
  const persistTasks: Promise<void>[] = [];
  const frameDuration = gapDuration / generatedFrames.length;
  let nextStart = firstClip.startTime + firstClip.duration;

  for (let i = 0; i < generatedFrames.length; i++) {
    const imageData = generatedFrames[i];
    const blob = await dataUrlToBlob(imageData);
    const sourceUrl = URL.createObjectURL(blob);
    const duration = i === generatedFrames.length - 1
      ? Math.max(VIDEO_GAP_INTERPOLATION_MIN_GAP, secondClip.startTime - nextStart)
      : frameDuration;

    const clip = createImageClip(
      firstClip.trackId,
      sourceUrl,
      outputSize,
      nextStart,
      duration,
    );
    clip.name = `${firstClip.name} • AI ${i + 1}/${generatedFrames.length}`;
    clip.imageData = imageData;
    createdClips.push(clip);
    nextStart += duration;

    persistTasks.push(
      saveMediaBlob(clip.id, blob).catch((error) => {
        console.error("Failed to save interpolated media blob:", error);
      })
    );
  }

  return { createdClips, persistTasks };
}

async function captureVideoFrame(sourceUrl: string, sourceTime: number): Promise<FrameSnapshot> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  if (!sourceUrl.startsWith("blob:") && !sourceUrl.startsWith("data:")) {
    video.crossOrigin = "anonymous";
  }

  const waitForMetadata = async () => {
    if (video.readyState >= 1 && Number.isFinite(video.duration)) return;
    await new Promise<void>((resolve, reject) => {
      const onLoadedMetadata = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Failed to load video metadata for interpolation."));
      };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.addEventListener("error", onError);
      video.load();
    });
  };

  const seekTo = async (time: number) => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const clamped = clamp(time, 0, Math.max(0, duration - VIDEO_SEEK_EPSILON));
    if (Math.abs(video.currentTime - clamped) <= VIDEO_SEEK_EPSILON) return;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Video seek timeout during interpolation."));
      }, 5000);
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Failed to seek video frame for interpolation."));
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);
      video.currentTime = clamped;
    });
  };

  video.src = sourceUrl;

  try {
    await waitForMetadata();
    await seekTo(sourceTime);

    const width = video.videoWidth || 1;
    const height = video.videoHeight || 1;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create interpolation frame canvas.");
    }

    ctx.drawImage(video, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      size: { width, height },
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

export async function captureClipBoundaryFrame(
  clip: Clip,
  boundary: "start" | "end",
  frameRate: number
): Promise<FrameSnapshot> {
  if (clip.type === "audio") {
    throw new Error("Audio clips are not supported for visual interpolation.");
  }

  if (clip.type === "image") {
    return {
      dataUrl: clip.imageData || clip.sourceUrl,
      size: { ...clip.sourceSize },
    };
  }

  const fps = Math.max(1, frameRate || 30);
  const frameStep = 1 / fps;
  const sourceStart = clip.trimIn;
  const sourceEnd = Math.max(sourceStart, clip.trimOut - VIDEO_SEEK_EPSILON);
  const sourceTime = boundary === "end"
    ? clamp(sourceStart + clip.duration - frameStep, sourceStart, sourceEnd)
    : clamp(sourceStart, sourceStart, sourceEnd);

  return captureVideoFrame(clip.sourceUrl, sourceTime);
}
