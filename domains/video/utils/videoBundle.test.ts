import { describe, expect, it } from "vitest";
import type { SavedVideoProject } from "../types/project";
import type { AudioClip, VideoClip } from "../types/clip";
import {
  base64ToBytes,
  bytesToBase64,
  chunkBase64,
  clipNeedsMediaBytes,
  createVideoBundleManifest,
  extensionForMediaType,
  mediaFileNameForAsset,
  mediaTypeForFileName,
  requiredMediaKeys,
  sourceIdFromMediaFileName,
  stripRuntimeSourceUrls,
  summarizeVideoBundleProject,
  validateVideoBundle,
  VIDEO_BUNDLE_FALLBACK_EXTENSION,
  VIDEO_BUNDLE_FALLBACK_MEDIA_TYPE,
  type VideoBundle,
  type VideoBundleMedia,
} from "./videoBundle";
import { INITIAL_TIMELINE_VIEW } from "../types/timeline";

const VIDEO_SOURCE = "src-trailer";
const BGM_SOURCE = "src-bgm";

function videoClip(overrides: Partial<VideoClip> = {}): VideoClip {
  return {
    id: "clip-video",
    name: "Trailer",
    type: "video",
    trackId: "track-video",
    startTime: 0,
    duration: 6,
    trimIn: 0,
    trimOut: 6,
    playbackSpeed: 1,
    opacity: 100,
    visible: true,
    locked: false,
    position: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    sourceUrl: "",
    sourceId: VIDEO_SOURCE,
    sourceDuration: 6,
    sourceSize: { width: 1920, height: 1080 },
    hasAudio: true,
    audioMuted: false,
    audioVolume: 100,
    ...overrides,
  };
}

function audioClip(overrides: Partial<AudioClip> = {}): AudioClip {
  return {
    id: "clip-bgm",
    name: "BGM",
    type: "audio",
    trackId: "track-audio",
    startTime: 1.5,
    duration: 8,
    trimIn: 0,
    trimOut: 8,
    playbackSpeed: 1,
    opacity: 100,
    visible: true,
    locked: false,
    position: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    sourceUrl: "",
    sourceId: BGM_SOURCE,
    sourceDuration: 8,
    sourceSize: { width: 0, height: 0 },
    audioMuted: false,
    audioVolume: 70,
    ...overrides,
  };
}

function savedProject(overrides: Partial<SavedVideoProject["project"]> = {}): SavedVideoProject {
  return {
    id: "project-1",
    name: "Sukuma Trailer",
    project: {
      id: "project-1",
      name: "Sukuma Trailer",
      canvasSize: { width: 1920, height: 1080 },
      frameRate: 30,
      duration: 9.5,
      tracks: [
        { id: "track-video", name: "V1", type: "video", zIndex: 1, visible: true, locked: false, muted: false, height: 45 },
        { id: "track-audio", name: "A1", type: "audio", zIndex: 0, visible: true, locked: false, muted: false, height: 45 },
      ],
      clips: [videoClip(), audioClip()],
      masks: [],
      assets: [
        { id: VIDEO_SOURCE, name: "trailer.mp4", type: "video", url: "", size: { width: 1920, height: 1080 }, duration: 6, mediaType: "video/mp4" },
        { id: BGM_SOURCE, name: "bgm.mp3", type: "audio", url: "", size: { width: 0, height: 0 }, duration: 8, mediaType: "audio/mpeg" },
      ],
      ...overrides,
    },
    timelineView: INITIAL_TIMELINE_VIEW,
    currentTime: 0,
    savedAt: 1_700_000_000_000,
  };
}

function media(sourceId: string, fileName: string, mediaType: string): VideoBundleMedia {
  return { sourceId, fileName, mediaType, base64: bytesToBase64(new Uint8Array([1, 2, 3])) };
}

function bundle(overrides: Partial<VideoBundle> = {}): VideoBundle {
  return {
    manifest: createVideoBundleManifest({ generator: "test" }),
    project: savedProject(),
    media: [
      media(VIDEO_SOURCE, `${VIDEO_SOURCE}.mp4`, "video/mp4"),
      media(BGM_SOURCE, `${BGM_SOURCE}.mp3`, "audio/mpeg"),
    ],
    ...overrides,
  };
}

describe("validateVideoBundle", () => {
  it("accepts a video track plus a separate audio track carrying BGM", () => {
    const result = validateVideoBundle(bundle());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects a clip whose sourceId has no media, because the editor would silently drop it", () => {
    const result = validateVideoBundle(bundle({ media: [media(VIDEO_SOURCE, `${VIDEO_SOURCE}.mp4`, "video/mp4")] }));
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(`no media for sourceId "${BGM_SOURCE}"`);
  });

  it("rejects media that matches neither a clip nor an asset", () => {
    const result = validateVideoBundle(
      bundle({ media: [...bundle().media, media("src-ghost", "src-ghost.wav", "audio/wav")] })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("matches no clip and no asset");
  });

  it("rejects a manifest from a newer format version", () => {
    const result = validateVideoBundle(bundle({ manifest: { format: "artkit-video-bundle", version: 99 } }));
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("newer than this app supports");
  });

  it("rejects a clip pointing at a track that is not in the project", () => {
    const project = savedProject();
    project.project.clips = [videoClip({ trackId: "track-missing" })];
    project.project.assets = project.project.assets.filter((asset) => asset.id === VIDEO_SOURCE);
    const result = validateVideoBundle(
      bundle({ project, media: [media(VIDEO_SOURCE, `${VIDEO_SOURCE}.mp4`, "video/mp4")] })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("is not one of project.tracks");
  });

  it("warns when an audio clip sits on a video track", () => {
    const project = savedProject();
    project.project.clips = [videoClip(), audioClip({ trackId: "track-video" })];
    const result = validateVideoBundle(bundle({ project }));
    expect(result.ok).toBe(true);
    expect(result.warnings.join("\n")).toContain("audio clip sits on a video track");
  });

  it("warns when clip.sourceId has no matching asset entry", () => {
    const project = savedProject();
    project.project.assets = project.project.assets.filter((asset) => asset.id !== BGM_SOURCE);
    const result = validateVideoBundle(bundle({ project }));
    expect(result.ok).toBe(true);
    expect(result.warnings.join("\n")).toContain("has no matching project.assets entry");
  });

  it("does not require media bytes for an inline data: source", () => {
    const project = savedProject();
    project.project.clips = [videoClip({ sourceUrl: "data:video/mp4;base64,AAAA", sourceId: "inline" })];
    project.project.assets = [];
    const result = validateVideoBundle(bundle({ project, media: [] }));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("media identity mapping", () => {
  it("maps media types to extensions and back", () => {
    expect(extensionForMediaType("video/mp4")).toBe(".mp4");
    expect(extensionForMediaType("audio/mpeg")).toBe(".mp3");
    expect(extensionForMediaType("AUDIO/WAV; codecs=1")).toBe(".wav");
    expect(extensionForMediaType(undefined)).toBe(VIDEO_BUNDLE_FALLBACK_EXTENSION);
    expect(mediaTypeForFileName("src-a.mp4")).toBe("video/mp4");
    expect(mediaTypeForFileName("src-a.MP3")).toBe("audio/mpeg");
    expect(mediaTypeForFileName("src-a")).toBe(VIDEO_BUNDLE_FALLBACK_MEDIA_TYPE);
  });

  it("round-trips a sourceId through the media file name", () => {
    const asset = { id: "src-uuid-1", mediaType: "video/webm", name: "a.webm" };
    const fileName = mediaFileNameForAsset(asset);
    expect(fileName).toBe("src-uuid-1.webm");
    expect(sourceIdFromMediaFileName(fileName)).toBe("src-uuid-1");
  });

  it("collects one media key per shared source, not per clip", () => {
    const project = savedProject();
    project.project.clips = [videoClip(), videoClip({ id: "clip-video-2", startTime: 6 })];
    expect(requiredMediaKeys(project)).toEqual([VIDEO_SOURCE]);
  });

  it("skips clips that carry their own bytes", () => {
    expect(clipNeedsMediaBytes(videoClip())).toBe(true);
    expect(clipNeedsMediaBytes(videoClip({ sourceUrl: "data:video/mp4;base64,AA" }))).toBe(false);
  });
});

describe("stripRuntimeSourceUrls", () => {
  it("clears blob: handles that mean nothing outside the session, and keeps data: content", () => {
    const project = savedProject();
    project.project.clips = [
      videoClip({ sourceUrl: "blob:http://localhost:3005/abc" }),
      audioClip({ sourceUrl: "data:audio/mpeg;base64,AAAA" }),
    ];
    project.project.assets = project.project.assets.map((asset) => ({ ...asset, url: "blob:http://x/y" }));

    const stripped = stripRuntimeSourceUrls(project);
    expect(stripped.project.clips[0].sourceUrl).toBe("");
    expect(stripped.project.clips[1].sourceUrl).toBe("data:audio/mpeg;base64,AAAA");
    expect(stripped.project.assets.every((asset) => asset.url === "")).toBe(true);
    // input is untouched
    expect(project.project.clips[0].sourceUrl).toBe("blob:http://localhost:3005/abc");
  });
});

describe("summarizeVideoBundleProject", () => {
  it("counts tracks, clips, and required media", () => {
    const summary = summarizeVideoBundleProject(savedProject());
    expect(summary.videoTrackCount).toBe(1);
    expect(summary.audioTrackCount).toBe(1);
    expect(summary.clipCounts).toEqual({ video: 1, audio: 1, image: 0 });
    expect(summary.mediaKeys.sort()).toEqual([BGM_SOURCE, VIDEO_SOURCE].sort());
  });
});

describe("base64 transfer", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array(1024);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 256;
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("splits and rejoins a payload without changing it", () => {
    const base64 = bytesToBase64(new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1]));
    const chunks = chunkBase64(base64, 4);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(base64);
  });

  it("returns one empty chunk for an empty payload so a zero-byte file still transfers", () => {
    expect(chunkBase64("", 16)).toEqual([""]);
  });
});
