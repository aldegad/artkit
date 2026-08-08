import { describe, expect, it } from "vitest";
import type { AudioClip, Clip, VideoTrack } from "../types";
import {
  buildPlaybackTrackClipIndex,
  resolveLookaheadStart,
  resolveUpcomingAudioClips,
} from "./playbackActiveMedia";

function track(id: string, overrides: Partial<VideoTrack> = {}): VideoTrack {
  return {
    id,
    name: id,
    type: "audio",
    zIndex: 0,
    visible: true,
    locked: false,
    muted: false,
    height: 45,
    ...overrides,
  };
}

function sfx(id: string, startTime: number, overrides: Partial<AudioClip> = {}): AudioClip {
  return {
    id,
    name: id,
    type: "audio",
    trackId: "a1",
    startTime,
    duration: 0.4,
    trimIn: 0,
    trimOut: 0.4,
    playbackSpeed: 1,
    opacity: 100,
    visible: true,
    locked: false,
    position: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    sourceUrl: "blob:sfx",
    sourceId: `src-${id}`,
    sourceDuration: 0.4,
    sourceSize: { width: 0, height: 0 },
    audioMuted: false,
    audioVolume: 90,
    ...overrides,
  };
}

function resolve(clips: Clip[], time: number, lookAhead: number, tracks = [track("a1")]) {
  return resolveUpcomingAudioClips({
    tracks,
    clipsByTrack: buildPlaybackTrackClipIndex(clips),
    time,
    lookAhead,
  }).map((clip) => clip.id);
}

describe("resolveUpcomingAudioClips", () => {
  it("returns clips starting inside the window, in start order", () => {
    const clips = [sfx("late", 1.2), sfx("soon", 0.3), sfx("beyond", 2.0)];
    expect(resolve(clips, 0, 1.5)).toEqual(["soon", "late"]);
  });

  it("includes a clip exactly at the window edge and excludes one just past it", () => {
    expect(resolve([sfx("edge", 0.4)], 0, 0.4)).toEqual(["edge"]);
    expect(resolve([sfx("past", 0.4001)], 0, 0.4)).toEqual([]);
  });

  it("excludes clips that already started — those belong to the active resolver", () => {
    // Starting an already-running clip again would double-trigger it.
    expect(resolve([sfx("playing", 0.5)], 0.5, 0.4)).toEqual([]);
    expect(resolve([sfx("started", 0.2)], 0.5, 0.4)).toEqual([]);
  });

  it("skips hidden tracks and hidden clips", () => {
    expect(resolve([sfx("hit", 0.2)], 0, 0.4, [track("a1", { visible: false })])).toEqual([]);
    expect(resolve([sfx("hit", 0.2, { visible: false })], 0, 0.4)).toEqual([]);
  });

  it("skips clips that would be silent anyway", () => {
    expect(resolve([sfx("muted", 0.2, { audioMuted: true })], 0, 0.4)).toEqual([]);
    expect(resolve([sfx("zero", 0.2, { audioVolume: 0 })], 0, 0.4)).toEqual([]);
  });

  it("collects across several audio tracks, ordered by start time not by track", () => {
    const clips = [
      sfx("a1-second", 0.3),
      sfx("a2-first", 0.1, { trackId: "a2" }),
    ];
    expect(resolve(clips, 0, 0.5, [track("a1"), track("a2")])).toEqual(["a2-first", "a1-second"]);
  });

  it("returns nothing for a non-positive window", () => {
    expect(resolve([sfx("hit", 0.2)], 0, 0)).toEqual([]);
    expect(resolve([sfx("hit", 0.2)], 0, -1)).toEqual([]);
  });
});

describe("resolveLookaheadStart", () => {
  it("converts timeline lead into an absolute context time", () => {
    const start = resolveLookaheadStart({
      clipStartTime: 2.5,
      currentTime: 2.2,
      rate: 1,
      contextTime: 100,
    });
    expect(start.leadTime).toBeCloseTo(0.3, 10);
    expect(start.when).toBeCloseTo(100.3, 10);
    expect(start.isFuture).toBe(true);
  });

  it("compresses the wall-clock lead when playing faster than realtime", () => {
    // 0.4s of timeline at 2x arrives in 0.2s of wall time.
    const start = resolveLookaheadStart({
      clipStartTime: 1.4,
      currentTime: 1.0,
      rate: 2,
      contextTime: 10,
    });
    expect(start.leadTime).toBeCloseTo(0.2, 10);
    expect(start.when).toBeCloseTo(10.2, 10);
  });

  it("stretches the lead when playing slower than realtime", () => {
    const start = resolveLookaheadStart({
      clipStartTime: 1.2,
      currentTime: 1.0,
      rate: 0.5,
      contextTime: 10,
    });
    expect(start.leadTime).toBeCloseTo(0.4, 10);
    expect(start.when).toBeCloseTo(10.4, 10);
  });

  it("reports a passed start as not-future and never schedules in the past", () => {
    const start = resolveLookaheadStart({
      clipStartTime: 1.0,
      currentTime: 1.2,
      rate: 1,
      contextTime: 50,
    });
    expect(start.isFuture).toBe(false);
    expect(start.leadTime).toBeLessThan(0);
    expect(start.when).toBe(50);
  });

  it("treats a zero or negative rate as the slowest allowed instead of dividing by zero", () => {
    const start = resolveLookaheadStart({
      clipStartTime: 1.1,
      currentTime: 1.0,
      rate: 0,
      contextTime: 0,
    });
    expect(Number.isFinite(start.when)).toBe(true);
    expect(start.leadTime).toBeCloseTo(10, 6);
  });
});
