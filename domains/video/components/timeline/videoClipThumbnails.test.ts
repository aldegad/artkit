import { describe, expect, it } from "vitest";
import { createAudioClip, createVideoClip } from "../../types";
import { buildVideoThumbnailTiles } from "./videoClipThumbnails";

describe("videoClipThumbnails", () => {
  it("creates proportional thumbnail samples across the visible source span", () => {
    const clip = createVideoClip(
      "track-a",
      "video.mp4",
      10,
      { width: 1920, height: 1080 },
      0
    );
    clip.trimIn = 2;
    clip.trimOut = 8;
    clip.duration = 6;

    const tiles = buildVideoThumbnailTiles(clip, 180);

    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles[0].sampleTime).toBeGreaterThan(2);
    expect(tiles[tiles.length - 1].sampleTime).toBeLessThan(8);
    expect(tiles.reduce((sum, tile) => sum + tile.width, 0)).toBeGreaterThan(0);
  });

  it("returns no tiles for non-video clips", () => {
    const audioClip = createAudioClip("track-a", "audio.wav", 4, 0);

    expect(buildVideoThumbnailTiles(audioClip, 200)).toEqual([]);
  });
});
