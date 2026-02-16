"use client";

export const DEFAULT_TIMELINE_FRAME_RATE = 30;
export const TIMELINE_TIME_PRECISION = 1_000_000;

export function normalizeTimelineFrameRate(frameRate: number): number {
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    return DEFAULT_TIMELINE_FRAME_RATE;
  }
  return Math.max(1, Math.round(frameRate));
}

export function normalizeTimelineTime(time: number): number {
  if (!Number.isFinite(time)) return 0;
  const clamped = Math.max(0, time);
  return Math.round(clamped * TIMELINE_TIME_PRECISION) / TIMELINE_TIME_PRECISION;
}

export function alignTimelineTimeToFrame(time: number, frameRate: number): number {
  const safeTime = normalizeTimelineTime(time);
  const frameIndex = Math.round(safeTime * frameRate);
  return normalizeTimelineTime(frameIndex / frameRate);
}
