import { describe, it, expect } from "vitest";
import { evaluateDirectVideoExportPlan } from "./videoExportPlanEvaluation";
import type { MaskData, VideoClip, VideoProject, VideoTrack } from "../types";

function makeTrack(overrides: Partial<VideoTrack> = {}): VideoTrack {
  return {
    id: "track-1",
    name: "Video 1",
    type: "video",
    zIndex: 0,
    visible: true,
    locked: false,
    muted: false,
    height: 48,
    ...overrides,
  };
}

function makeVideoClip(overrides: Partial<VideoClip> = {}): VideoClip {
  return {
    id: "clip-1",
    name: "clip",
    trackId: "track-1",
    type: "video",
    startTime: 0,
    duration: 10,
    trimIn: 0,
    trimOut: 10,
    playbackSpeed: 1,
    opacity: 100,
    visible: true,
    locked: false,
    position: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    sourceUrl: "blob:source",
    sourceId: "source-1",
    sourceDuration: 10,
    sourceSize: { width: 1920, height: 1080 },
    hasAudio: true,
    audioMuted: false,
    audioVolume: 100,
    ...overrides,
  };
}

function makeProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    id: "project-1",
    name: "Project",
    canvasSize: { width: 1920, height: 1080 },
    frameRate: 30,
    duration: 10,
    tracks: [],
    clips: [],
    masks: [],
    assets: [],
    ...overrides,
  } as VideoProject;
}

function evaluate(params: {
  clips?: VideoClip[];
  tracks?: VideoTrack[];
  masksMap?: Map<string, MaskData>;
  exportStart?: number;
  exportEnd?: number;
  includeAudio?: boolean;
}) {
  return evaluateDirectVideoExportPlan({
    clips: params.clips ?? [makeVideoClip()],
    tracks: params.tracks ?? [makeTrack()],
    masksMap: params.masksMap ?? new Map(),
    project: makeProject(),
    exportStart: params.exportStart ?? 0,
    exportEnd: params.exportEnd ?? 10,
    includeAudio: params.includeAudio ?? true,
  });
}

describe("evaluateDirectVideoExportPlan", () => {
  it("plans a single full-canvas clip for the direct path", () => {
    const result = evaluate({});

    expect(result.plan).not.toBeNull();
    expect(result.plan?.kind).toBe("single");
    if (result.plan?.kind !== "single") return;
    expect(result.plan.cropX).toBe(0);
    expect(result.plan.cropY).toBe(0);
    expect(result.plan.cropWidth).toBe(1920);
    expect(result.plan.cropHeight).toBe(1080);
    expect(result.plan.sourceStart).toBe(0);
    expect(result.plan.sourceDuration).toBe(10);
    expect(result.plan.includeAudio).toBe(true);
  });

  it("maps a trimmed export range through trimIn and playback speed", () => {
    const clip = makeVideoClip({
      startTime: 2,
      duration: 4,
      trimIn: 1,
      trimOut: 9,
      playbackSpeed: 2,
      sourceDuration: 10,
    });
    const result = evaluate({ clips: [clip], exportStart: 3, exportEnd: 5 });

    expect(result.plan?.kind).toBe("single");
    if (result.plan?.kind !== "single") return;
    // local time 1s at 2x speed from trimIn 1 → source 3s
    expect(result.plan.sourceStart).toBeCloseTo(3, 5);
    // 2s of timeline at 2x speed → 4s of source
    expect(result.plan.sourceDuration).toBeCloseTo(4, 5);
  });

  it("rejects the direct path when the timeline is empty in range", () => {
    const result = evaluate({ exportStart: 20, exportEnd: 25 });
    expect(result.plan).toBeNull();
    expect(result.reason).toBeTruthy();
  });

  it("rejects the direct path when a mask exists", () => {
    const masksMap = new Map<string, MaskData>([
      ["mask-1", { id: "mask-1", trackId: "track-1", maskData: "data:image/png;base64,xx" } as MaskData],
    ]);
    const result = evaluate({ masksMap });
    expect(result.plan).toBeNull();
  });

  it("rejects the direct path for rotated clips", () => {
    const result = evaluate({ clips: [makeVideoClip({ rotation: 15 })] });
    expect(result.plan).toBeNull();
  });

  it("rejects the direct path when the clip track is hidden", () => {
    const result = evaluate({ tracks: [makeTrack({ visible: false })] });
    expect(result.plan).toBeNull();
  });

  it("disables audio in the plan when the clip is muted", () => {
    const result = evaluate({ clips: [makeVideoClip({ audioMuted: true })] });
    expect(result.plan?.kind).toBe("single");
    if (result.plan?.kind !== "single") return;
    expect(result.plan.includeAudio).toBe(false);
  });

  it("crops to the visible window for an offset clip", () => {
    const clip = makeVideoClip({ position: { x: -100, y: 50 } });
    const result = evaluate({ clips: [clip] });

    expect(result.plan?.kind).toBe("single");
    if (result.plan?.kind !== "single") return;
    expect(result.plan.cropX).toBe(100);
    expect(result.plan.cropY).toBe(0);
    expect(result.plan.cropWidth).toBe(1820);
    expect(result.plan.cropHeight).toBe(1030);
    expect(result.plan.padX).toBe(0);
    expect(result.plan.padY).toBe(50);
  });
});
