import "fake-indexeddb/auto";
import { resolveObjectURL } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  loadMediaBlob,
  moveMediaBlob,
  objectUrlForKey,
  releaseAllObjectUrls,
  saveMediaBlob,
} from "./mediaStorage";

/**
 * Razor split's real path, reproduced.
 *
 * `useTimelineClipActions` calls `moveMediaBlob(clip.id, firstClip.id)` and
 * `buildRazorSplitClips` spreads the original clip, so BOTH halves still carry the
 * original `sourceUrl`. When `moveMediaBlob`'s trailing delete released that URL, the
 * two live clips were left pointing at a revoked blob — reachable through inpaint /
 * frame capture / gap interpolation, all of which store bytes under `clip.id`.
 *
 * `resolveObjectURL` returning undefined is exactly "this URL is dead", which is what
 * the consumers that re-fetch (`useAudioBufferCache`, `videoExportIO`) would hit.
 */
describe("moveMediaBlob keeps a live objectURL alive", () => {
  it("does not revoke the URL the split halves still hold", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "video/mp4" });
    await saveMediaBlob("clip-owned", blob);

    const live = objectUrlForKey("clip-owned", blob);
    expect(resolveObjectURL(live)).toBeDefined();

    await moveMediaBlob("clip-owned", "first-half");

    // the URL both halves reference must still resolve
    expect(resolveObjectURL(live)).toBeDefined();
    // and the new key must hand out that same live URL, not a second name
    const stored = await loadMediaBlob("first-half");
    expect(stored).not.toBeNull();
    expect(objectUrlForKey("first-half", stored as Blob)).toBe(live);

    releaseAllObjectUrls();
  });

  it("moves the bytes as before", async () => {
    const blob = new Blob([new Uint8Array([9, 9])], { type: "audio/mpeg" });
    await saveMediaBlob("from", blob);

    expect(await moveMediaBlob("from", "to")).toBe(true);
    expect(await loadMediaBlob("to")).not.toBeNull();
    expect(await loadMediaBlob("from")).toBeNull();

    releaseAllObjectUrls();
  });

  it("reports false and touches nothing when the source has no bytes", async () => {
    expect(await moveMediaBlob("absent", "target")).toBe(false);
    expect(await loadMediaBlob("target")).toBeNull();
  });
});

/**
 * Split, then edit ONE half.
 *
 * After a split the two halves share one cache entry, so overwriting the edited
 * half's key must not kill the URL the untouched half is still playing — that clip
 * legitimately still plays the ORIGINAL bytes. Reproduced by the validator
 * (2026-08-08) as: save under clip.id → moveMediaBlob (split) → saveMediaBlob on the
 * first half → the second half's URL was dead.
 */
describe("editing one split half leaves the sibling's URL alive", () => {
  it("keeps the shared URL resolvable after the edited half is overwritten", async () => {
    const original = new Blob([new Uint8Array([1, 1, 1, 1])], { type: "video/mp4" });
    await saveMediaBlob("clip-owned", original);
    const shared = objectUrlForKey("clip-owned", original);

    await moveMediaBlob("clip-owned", "first-half"); // razor split
    const inpainted = new Blob([new Uint8Array([2, 2])], { type: "video/mp4" });
    await saveMediaBlob("first-half", inpainted); // inpaint the first half

    // the untouched sibling still plays the original bytes through this URL
    expect(resolveObjectURL(shared)).toBeDefined();

    // and the edited key hands out a NEW name for its new bytes
    const stored = await loadMediaBlob("first-half");
    expect(objectUrlForKey("first-half", stored as Blob)).not.toBe(shared);

    releaseAllObjectUrls();
  });
});
