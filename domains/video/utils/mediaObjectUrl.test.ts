import { describe, expect, it } from "vitest";
import {
  objectUrlForKey,
  releaseAllObjectUrls,
  releaseObjectUrlForKey,
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
