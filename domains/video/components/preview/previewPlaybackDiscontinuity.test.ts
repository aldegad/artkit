import { describe, expect, it } from "vitest";

import {
  hasDirectPreviewClipTransition,
  hasPreviewPlaybackDiscontinuity,
} from "./previewPlaybackDiscontinuity";
import { resolveAdaptivePlaybackPreviewPolicy } from "./previewCanvasConfig";

describe("hasPreviewPlaybackDiscontinuity", () => {
  it("ignores expected playback progression", () => {
    expect(hasPreviewPlaybackDiscontinuity({
      previousTimelineTime: 1,
      previousWallTimeMs: 1_000,
      nextTimelineTime: 1.05,
      nextWallTimeMs: 1_050,
      playbackRate: 1,
    })).toBe(false);
  });

  it("detects backward loop wraps and seeks", () => {
    expect(hasPreviewPlaybackDiscontinuity({
      previousTimelineTime: 3,
      previousWallTimeMs: 1_000,
      nextTimelineTime: 2.7,
      nextWallTimeMs: 1_050,
      playbackRate: 1,
    })).toBe(true);
  });

  it("detects large unexpected forward seeks", () => {
    expect(hasPreviewPlaybackDiscontinuity({
      previousTimelineTime: 1,
      previousWallTimeMs: 1_000,
      nextTimelineTime: 2,
      nextWallTimeMs: 1_050,
      playbackRate: 1,
    })).toBe(true);
  });
});

describe("hasDirectPreviewClipTransition", () => {
  it("fires only when the active clip changes", () => {
    expect(hasDirectPreviewClipTransition(null, "clip-a")).toBe(false);
    expect(hasDirectPreviewClipTransition("clip-a", "clip-a")).toBe(false);
    expect(hasDirectPreviewClipTransition("clip-a", "clip-b")).toBe(true);
  });
});

describe("resolveAdaptivePlaybackPreviewPolicy", () => {
  it("forces DPR 1 for mobile direct preview playback", () => {
    expect(resolveAdaptivePlaybackPreviewPolicy({
      playbackIsPlaying: true,
      qualityFirstMode: true,
      clipCount: 2,
      visualClipCount: 2,
      baseMaxCanvasDpr: Number.POSITIVE_INFINITY,
      basePlaybackRenderFpsCap: 60,
      directPreviewOptimized: true,
      isMobileLike: true,
    })).toEqual({
      maxCanvasDpr: 1,
      playbackRenderFpsCap: 60,
      smoothingQuality: "high",
    });
  });

  it("preserves the regular playback policy when direct preview is off", () => {
    expect(resolveAdaptivePlaybackPreviewPolicy({
      playbackIsPlaying: true,
      qualityFirstMode: false,
      clipCount: 8,
      visualClipCount: 8,
      baseMaxCanvasDpr: 2,
      basePlaybackRenderFpsCap: 60,
      directPreviewOptimized: false,
      isMobileLike: true,
    })).toEqual({
      maxCanvasDpr: 1.25,
      playbackRenderFpsCap: 30,
      smoothingQuality: "medium",
    });
  });
});
