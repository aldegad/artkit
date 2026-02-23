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
  const safeFrameRate = normalizeTimelineFrameRate(frameRate);
  const frameIndex = toTimelineFrameIndex(time, safeFrameRate);
  return timelineFrameIndexToTime(frameIndex, safeFrameRate);
}

export function toTimelineFrameIndex(time: number, frameRate: number): number {
  const safeFrameRate = normalizeTimelineFrameRate(frameRate);
  const safeTime = normalizeTimelineTime(time);
  return Math.max(0, Math.round(safeTime * safeFrameRate));
}

export function timelineFrameIndexToTime(frameIndex: number, frameRate: number): number {
  const safeFrameRate = normalizeTimelineFrameRate(frameRate);
  if (!Number.isFinite(frameIndex)) return 0;
  return normalizeTimelineTime(Math.max(0, Math.round(frameIndex)) / safeFrameRate);
}

export interface TimelineFrameRange {
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
  frameCount: number;
  duration: number;
}

/**
 * Quantize a clip range to timeline frames.
 * Start is rounded to nearest frame; end is rounded and clamped to at least one frame.
 */
export function getTimelineFrameRange(
  startTime: number,
  duration: number,
  frameRate: number,
  minimumFrameCount: number = 1
): TimelineFrameRange {
  const safeFrameRate = normalizeTimelineFrameRate(frameRate);
  const minFrames = Math.max(1, Math.floor(Number.isFinite(minimumFrameCount) ? minimumFrameCount : 1));
  const safeStartTime = normalizeTimelineTime(startTime);
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const safeEndTime = normalizeTimelineTime(safeStartTime + safeDuration);

  const startFrame = toTimelineFrameIndex(safeStartTime, safeFrameRate);
  const roundedEndFrame = Math.max(
    startFrame,
    Math.round(safeEndTime * safeFrameRate)
  );
  const endFrame = Math.max(startFrame + minFrames, roundedEndFrame);
  const frameCount = Math.max(minFrames, endFrame - startFrame);
  const alignedStartTime = timelineFrameIndexToTime(startFrame, safeFrameRate);
  const alignedEndTime = timelineFrameIndexToTime(endFrame, safeFrameRate);

  return {
    startFrame,
    endFrame,
    startTime: alignedStartTime,
    endTime: alignedEndTime,
    frameCount,
    duration: normalizeTimelineTime(alignedEndTime - alignedStartTime),
  };
}
