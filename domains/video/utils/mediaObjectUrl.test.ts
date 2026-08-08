import { describe, expect, it } from "vitest";
import {
  objectUrlForKey,
  releaseAllObjectUrls,
  releaseObjectUrlForKey,
  renameObjectUrlKey,
} from "./mediaStorage";

/**
 * One name per storage key.
 *
 * Creating a URL per CLIP gave the same bytes several names (16 clips over 3 sources
 * produced 14 distinct URLs), and pooled media elements compare the incoming
 * `clip.sourceUrl` against the one they hold — so every extra name forced another
 * `src = …` + `load()`. Measured 224 src assignments in 3s before, 0 after.
 *
 * Keying on the Blob object instead does nothing: reading the same record twice
 * returns two different Blob instances, so every lookup misses. These tests pin the
 * key-based behaviour so that mistake cannot come back quietly.
 */

function blob(text: string): Blob {
  return new Blob([text], { type: "audio/mpeg" });
}

describe("objectUrlForKey", () => {
  it("returns the same URL for the same key, even across different Blob instances", () => {
    // This is the real situation: loadMediaBlob rebuilds the Blob on every read.
    const first = objectUrlForKey("src-a", blob("same bytes"));
    const second = objectUrlForKey("src-a", blob("same bytes"));
    expect(second).toBe(first);
    releaseObjectUrlForKey("src-a");
  });

  it("gives different keys different URLs", () => {
    const a = objectUrlForKey("src-a", blob("a"));
    const b = objectUrlForKey("src-b", blob("b"));
    expect(a).not.toBe(b);
    releaseAllObjectUrls();
  });

  it("mints a fresh URL after the key is released", () => {
    const before = objectUrlForKey("src-a", blob("a"));
    releaseObjectUrlForKey("src-a");
    const after = objectUrlForKey("src-a", blob("a"));
    expect(after).not.toBe(before);
    releaseAllObjectUrls();
  });

  it("releasing an unknown key is a no-op", () => {
    expect(() => releaseObjectUrlForKey("never-seen")).not.toThrow();
  });

  it("releaseAllObjectUrls drops every cached name", () => {
    const a = objectUrlForKey("src-a", blob("a"));
    const b = objectUrlForKey("src-b", blob("b"));
    releaseAllObjectUrls();
    expect(objectUrlForKey("src-a", blob("a"))).not.toBe(a);
    expect(objectUrlForKey("src-b", blob("b"))).not.toBe(b);
    releaseAllObjectUrls();
  });
});

/**
 * Renaming bytes is not deleting them.
 *
 * Razor split goes through `moveMediaBlob`, whose last step deletes the source key,
 * and both halves are `{ ...clip }` spreads still carrying the original `sourceUrl`.
 * Releasing on that delete killed a URL two live clips pointed at — the first
 * validator reject of this plan. The rename below is what makes the later release a
 * no-op instead of a revoke.
 */
describe("renameObjectUrlKey", () => {
  function blob2(text: string): Blob {
    return new Blob([text], { type: "video/mp4" });
  }

  it("keeps the same URL alive under the new key", () => {
    const live = objectUrlForKey("clip-owned", blob2("bytes"));
    renameObjectUrlKey("clip-owned", "first-half");
    expect(objectUrlForKey("first-half", blob2("bytes"))).toBe(live);
    releaseAllObjectUrls();
  });

  it("leaves nothing behind at the old key, so a later release is a no-op", () => {
    const live = objectUrlForKey("clip-owned", blob2("bytes"));
    renameObjectUrlKey("clip-owned", "first-half");
    releaseObjectUrlForKey("clip-owned"); // what deleteMediaBlob will do
    // the live URL must still be the one the new key hands out
    expect(objectUrlForKey("first-half", blob2("bytes"))).toBe(live);
    releaseAllObjectUrls();
  });

  it("does nothing when the source key has no URL", () => {
    renameObjectUrlKey("never-seen", "target");
    const fresh = objectUrlForKey("target", blob2("bytes"));
    expect(typeof fresh).toBe("string");
    releaseAllObjectUrls();
  });

  it("is a no-op when both keys are the same", () => {
    const url = objectUrlForKey("same", blob2("bytes"));
    renameObjectUrlKey("same", "same");
    expect(objectUrlForKey("same", blob2("bytes"))).toBe(url);
    releaseAllObjectUrls();
  });

  it("replaces a URL already sitting at the target key", () => {
    const stale = objectUrlForKey("target", blob2("old"));
    const live = objectUrlForKey("source", blob2("new"));
    renameObjectUrlKey("source", "target");
    const now = objectUrlForKey("target", blob2("new"));
    expect(now).toBe(live);
    expect(now).not.toBe(stale);
    releaseAllObjectUrls();
  });
});
