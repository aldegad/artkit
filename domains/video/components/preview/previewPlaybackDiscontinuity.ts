"use client";

import { WEB_AUDIO } from "../../constants";

interface PreviewPlaybackDiscontinuityParams {
  previousTimelineTime: number | null;
  previousWallTimeMs: number | null;
  nextTimelineTime: number;
  nextWallTimeMs: number;
  playbackRate: number;
}

export function hasPreviewPlaybackDiscontinuity(
  params: PreviewPlaybackDiscontinuityParams
): boolean {
  const {
    previousTimelineTime,
    previousWallTimeMs,
    nextTimelineTime,
    nextWallTimeMs,
    playbackRate,
  } = params;

  if (previousTimelineTime === null || previousWallTimeMs === null) {
    return false;
  }

  const actualDelta = nextTimelineTime - previousTimelineTime;
  const elapsedSec = Math.max(0, (nextWallTimeMs - previousWallTimeMs) / 1000);
  const expectedDelta = elapsedSec * Math.max(0.01, playbackRate);
  const jumpMagnitude = Math.abs(actualDelta);
  const driftFromExpected = Math.abs(actualDelta - expectedDelta);
  const isBackwardJump = actualDelta < -WEB_AUDIO.BACKWARD_JUMP_EPSILON;
  const isLargeUnexpectedJump =
    jumpMagnitude > WEB_AUDIO.SEEK_JUMP_THRESHOLD
    && driftFromExpected > WEB_AUDIO.SEEK_DRIFT_TOLERANCE;

  return isBackwardJump || isLargeUnexpectedJump;
}

export function hasDirectPreviewClipTransition(
  previousClipId: string | null,
  nextClipId: string
): boolean {
  return previousClipId !== null && previousClipId !== nextClipId;
}
