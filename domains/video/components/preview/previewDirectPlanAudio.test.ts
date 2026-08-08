import { describe, expect, it } from "vitest";
import type { AudioClip, Clip, VideoClip, VideoTrack } from "@/domains/video/types";
import { resolveDirectPreviewPlan } from "./previewCanvasConfig";

/**
 * The direct-preview plan is a VISUAL decision and must stay one.
 *
 * Preview audio used to be gated on this plan, which made a single-visual-track
 * project play audio through media elements instead of the Web Audio scheduler —
 * measured ~64ms late per one-shot, an offset that a user matching SFX by ear then
 * baked into the edit (export renders audio offline at sample accuracy).
 *
 * That was fixed by ungating audio, NOT by narrowing this plan. These tests pin
 * that direction: a project with audio clips still gets the visual fast path. If a
 * later change makes audio narrow this decision again, the optimization silently
 * disappears for every project that has sound, which is almost all of them.
 */

function track(id: string, type: "video" | "audio", overrides: Partial<VideoTrack> = {}): VideoTrack {
  return {
    id, name: id, type, zIndex: 0, visible: true, locked: false, muted: false, height: 45,
    ...overrides,
  };
}

function videoClip(overrides: Partial<VideoClip> = {}): VideoClip {
  return {
    id: "clip-v", name: "V", type: "video", trackId: "v1",
    startTime: 0, duration: 5, trimIn: 0, trimOut: 5, playbackSpeed: 1,
    opacity: 100, visible: true, locked: false,
    position: { x: 0, y: 0 }, scale: 1, rotation: 0,
    sourceUrl: "blob:v", sourceId: "src-v", sourceDuration: 5,
    sourceSize: { width: 640, height: 360 },
    hasAudio: true, audioMuted: false, audioVolume: 100,
    ...overrides,
  };
}

function audioClip(overrides: Partial<AudioClip> = {}): AudioClip {
  return {
    id: "clip-a", name: "A", type: "audio", trackId: "a1",
    startTime: 0, duration: 5, trimIn: 0, trimOut: 5, playbackSpeed: 1,
    opacity: 100, visible: true, locked: false,
    position: { x: 0, y: 0 }, scale: 1, rotation: 0,
    sourceUrl: "blob:a", sourceId: "src-a", sourceDuration: 5,
    sourceSize: { width: 0, height: 0 },
    audioMuted: false, audioVolume: 90,
    ...overrides,
  };
}

describe("resolveDirectPreviewPlan stays a visual-only decision", () => {
  it("keeps the fast path for one visual track even when audio tracks carry clips", () => {
    const tracks = [track("v1", "video"), track("a1", "audio"), track("a2", "audio")];
    const clips: Clip[] = [
      videoClip(),
      audioClip(),
      audioClip({ id: "clip-a2", trackId: "a2", startTime: 1, duration: 0.25, trimOut: 0.25 }),
    ];
    expect(resolveDirectPreviewPlan(tracks, clips, 0)).toEqual({ trackId: "v1" });
  });

  it("keeps the fast path when the single video clip has its own audio", () => {
    const tracks = [track("v1", "video")];
    expect(resolveDirectPreviewPlan(tracks, [videoClip({ hasAudio: true })], 0)).toEqual({ trackId: "v1" });
  });

  it("still refuses the fast path for the visual reasons it owns", () => {
    const tracks = [track("v1", "video"), track("v2", "video")];
    const twoVisual: Clip[] = [videoClip(), videoClip({ id: "clip-v2", trackId: "v2" })];
    expect(resolveDirectPreviewPlan(tracks, twoVisual, 0)).toBeNull();

    // masks
    expect(resolveDirectPreviewPlan([track("v1", "video")], [videoClip()], 1)).toBeNull();

    // two different video sources on the one track
    const twoSources: Clip[] = [
      videoClip(),
      videoClip({ id: "clip-v2", sourceId: "src-other", startTime: 5 }),
    ];
    expect(resolveDirectPreviewPlan([track("v1", "video")], twoSources, 0)).toBeNull();
  });
});
