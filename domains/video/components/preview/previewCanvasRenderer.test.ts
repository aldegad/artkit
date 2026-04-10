import { describe, expect, it } from "vitest";

import type { Clip, MaskData, VideoTrack } from "../../types";
import {
  canReuseCommittedBaseFrame,
  resolvePresentedBaseCanvasSource,
  shouldCommitWorkingCompositeFrame,
  type PreviewBaseFrameState,
} from "./previewCanvasRenderer";

describe("canReuseCommittedBaseFrame", () => {
  it("reuses the committed base only for the same fully-ready multilayer frame state", () => {
    const tracks = [{ id: "track-a" }] as unknown as VideoTrack[];
    const clips = [{ id: "clip-a" }] as unknown as Clip[];
    const masks = new Map<string, MaskData>();
    const previousBaseFrame: PreviewBaseFrameState = {
      renderTime: 1,
      clipsRef: clips,
      tracksRef: tracks,
      masksRef: masks,
      playbackIsPlaying: true,
      directPreviewTrackId: null,
      fullyReady: true,
    };

    expect(canReuseCommittedBaseFrame({
      usesDirectVideoPreview: false,
      hasCachedBitmap: false,
      isEditingMask: false,
      hasCommittedCompositeFrame: true,
      previousBaseFrame,
      currentClipsRef: clips,
      currentTracksRef: tracks,
      currentMasksRef: masks,
      playbackIsPlaying: true,
      directPreviewTrackId: null,
      renderTime: 1,
    })).toBe(true);
  });

  it("drops the reuse path when the previous base frame was not fully ready", () => {
    const tracks = [{ id: "track-a" }] as unknown as VideoTrack[];
    const clips = [{ id: "clip-a" }] as unknown as Clip[];
    const masks = new Map<string, MaskData>();

    expect(canReuseCommittedBaseFrame({
      usesDirectVideoPreview: false,
      hasCachedBitmap: false,
      isEditingMask: false,
      hasCommittedCompositeFrame: true,
      previousBaseFrame: {
        renderTime: 1,
        clipsRef: clips,
        tracksRef: tracks,
        masksRef: masks,
        playbackIsPlaying: true,
        directPreviewTrackId: null,
        fullyReady: false,
      },
      currentClipsRef: clips,
      currentTracksRef: tracks,
      currentMasksRef: masks,
      playbackIsPlaying: true,
      directPreviewTrackId: null,
      renderTime: 1,
    })).toBe(false);
  });

  it("reuses the committed base for overlay-only updates because base inputs are unchanged", () => {
    const tracks = [{ id: "track-a" }, { id: "track-b" }] as unknown as VideoTrack[];
    const clips = [{ id: "clip-a" }, { id: "clip-b" }] as unknown as Clip[];
    const masks = new Map<string, MaskData>();
    const previousBaseFrame: PreviewBaseFrameState = {
      renderTime: 2,
      clipsRef: clips,
      tracksRef: tracks,
      masksRef: masks,
      playbackIsPlaying: false,
      directPreviewTrackId: null,
      fullyReady: true,
    };

    expect(canReuseCommittedBaseFrame({
      usesDirectVideoPreview: false,
      hasCachedBitmap: false,
      isEditingMask: false,
      hasCommittedCompositeFrame: true,
      previousBaseFrame,
      currentClipsRef: clips,
      currentTracksRef: tracks,
      currentMasksRef: masks,
      playbackIsPlaying: false,
      directPreviewTrackId: null,
      renderTime: 2,
    })).toBe(true);
  });

  it("drops the reuse path when saved mask content changes even if clips and tracks stay the same", () => {
    const tracks = [{ id: "track-a" }] as unknown as VideoTrack[];
    const clips = [{ id: "clip-a" }] as unknown as Clip[];
    const previousMasks = new Map<string, MaskData>();
    const currentMasks = new Map<string, MaskData>();

    expect(canReuseCommittedBaseFrame({
      usesDirectVideoPreview: false,
      hasCachedBitmap: false,
      isEditingMask: false,
      hasCommittedCompositeFrame: true,
      previousBaseFrame: {
        renderTime: 1,
        clipsRef: clips,
        tracksRef: tracks,
        masksRef: previousMasks,
        playbackIsPlaying: false,
        directPreviewTrackId: null,
        fullyReady: true,
      },
      currentClipsRef: clips,
      currentTracksRef: tracks,
      currentMasksRef: currentMasks,
      playbackIsPlaying: false,
      directPreviewTrackId: null,
      renderTime: 1,
    })).toBe(false);
  });
});

describe("shouldCommitWorkingCompositeFrame", () => {
  it("commits only when the composite base frame is fully ready", () => {
    expect(shouldCommitWorkingCompositeFrame({
      usesDirectVideoPreview: false,
      canReuseCommittedBase: false,
      baseFrameReady: false,
    })).toBe(false);

    expect(shouldCommitWorkingCompositeFrame({
      usesDirectVideoPreview: false,
      canReuseCommittedBase: false,
      baseFrameReady: true,
    })).toBe(true);
  });
});

describe("resolvePresentedBaseCanvasSource", () => {
  it("keeps presenting the committed composite when a later live frame is not ready", () => {
    expect(resolvePresentedBaseCanvasSource({
      usesDirectVideoPreview: false,
      canReuseCommittedBase: false,
      baseFrameReady: false,
      hasCommittedCompositeFrame: true,
    })).toBe("committed");
  });

  it("covers the mobile multilayer regression path with the production helper", () => {
    expect(resolvePresentedBaseCanvasSource({
      usesDirectVideoPreview: false,
      canReuseCommittedBase: false,
      baseFrameReady: false,
      hasCommittedCompositeFrame: true,
    })).toBe("committed");
  });
});
