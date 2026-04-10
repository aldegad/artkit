import { describe, expect, it } from "vitest";
import { createAudioClip, createImageClip, createVideoClip } from "../types";
import {
  canTrimClipEndAtTime,
  canTrimClipStartAtTime,
  closeTimelineTrackGaps,
} from "./timelineEditing";

describe("timelineEditing", () => {
  it("validates trim start and end against playhead and min duration", () => {
    const clip = createVideoClip(
      "track-a",
      "video.mp4",
      6,
      { width: 1920, height: 1080 },
      2
    );

    expect(canTrimClipStartAtTime(clip, 2.05, 0.1)).toBe(false);
    expect(canTrimClipStartAtTime(clip, 3, 0.1)).toBe(true);
    expect(canTrimClipEndAtTime(clip, 7.95, 0.1)).toBe(false);
    expect(canTrimClipEndAtTime(clip, 5, 0.1)).toBe(true);
  });

  it("packs every track forward without changing track-local order", () => {
    const videoClip = {
      ...createVideoClip("track-a", "video.mp4", 2, { width: 1280, height: 720 }, 1.5),
      id: "video-1",
    };
    const imageClip = {
      ...createImageClip("track-a", "frame.png", { width: 100, height: 100 }, 4.25, 1.5),
      id: "image-1",
    };
    const audioClip = {
      ...createAudioClip("track-b", "audio.wav", 1, 2.1),
      id: "audio-1",
    };

    const result = closeTimelineTrackGaps([videoClip, imageClip, audioClip], 30);
    const byId = new Map(result.clips.map((clip) => [clip.id, clip]));

    expect(result.changed).toBe(true);
    expect(byId.get("video-1")?.startTime).toBe(0);
    expect(byId.get("image-1")?.startTime).toBe(2);
    expect(byId.get("audio-1")?.startTime).toBe(0);
  });

  it("returns the original clip list when tracks are already compact", () => {
    const firstClip = {
      ...createVideoClip("track-a", "video.mp4", 1, { width: 640, height: 360 }, 0),
      id: "video-compact-1",
    };
    const secondClip = {
      ...createImageClip("track-a", "frame.png", { width: 100, height: 100 }, 1, 1),
      id: "image-compact-2",
    };

    const result = closeTimelineTrackGaps([firstClip, secondClip], 30);

    expect(result.changed).toBe(false);
    expect(result.clips).toBeDefined();
    expect(result.clips[0].startTime).toBe(0);
    expect(result.clips[1].startTime).toBe(1);
  });
});
