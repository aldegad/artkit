import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  createMediaUrlResolver,
  loadMediaBlob,
  objectUrlForKey,
  releaseAllObjectUrls,
  saveMediaBlob,
} from "./mediaStorage";

/**
 * The cloud loader's real sequence.
 *
 * `saveMediaBlob` forgets a key's cached name on purpose (same key can receive new
 * bytes), so save-then-name PER CLIP re-mints every time and the key cache degrades
 * to `URL.createObjectURL` — k clips sharing one source produce k names, which is the
 * exact number the fix was supposed to remove. Reproduced by the validator
 * (2026-08-08); the first attempt at this fix shipped with that hole because the unit
 * tests only exercised `objectUrlForKey` on its own, never after a save.
 */
describe("createMediaUrlResolver", () => {
  function blob(text: string): Blob {
    return new Blob([text], { type: "video/mp4" });
  }

  it("gives clips that share a source ONE name, across the save that forgets", async () => {
    const resolve = createMediaUrlResolver();
    const shared = blob("shared bytes");
    const metas = [
      { id: "clip-1", sourceId: "src-a" },
      { id: "clip-2", sourceId: "src-a" },
      { id: "clip-3", sourceId: "src-a" },
    ];

    const urls = await Promise.all(
      metas.map((meta) => resolve(meta.sourceId || meta.id, shared))
    );

    expect(new Set(urls).size).toBe(1);
    expect(await loadMediaBlob("src-a")).not.toBeNull();
    releaseAllObjectUrls();
  });

  it("still separates different sources", async () => {
    const resolve = createMediaUrlResolver();
    const a = await resolve("src-a", blob("a"));
    const b = await resolve("src-b", blob("b"));
    expect(a).not.toBe(b);
    releaseAllObjectUrls();
  });

  it("is idempotent for repeated resolves of the same key", async () => {
    const resolve = createMediaUrlResolver();
    const first = await resolve("src-a", blob("a"));
    const second = await resolve("src-a", blob("a"));
    expect(second).toBe(first);
    releaseAllObjectUrls();
  });

  it("does not leak names across load passes", async () => {
    // A resolver is scoped to one load; a second load may legitimately mint again
    // because the bytes could have been replaced meanwhile.
    const first = await createMediaUrlResolver()("src-a", blob("a"));
    const second = await createMediaUrlResolver()("src-a", blob("a"));
    // the second pass re-saves, which forgets, so a new name is expected and correct
    expect(typeof second).toBe("string");
    expect(second).not.toBe(first);
    releaseAllObjectUrls();
  });

  it("shows why the naive sequence fails, so the regression is legible", async () => {
    // save-then-name per clip: what the rejected commit did
    const shared = blob("shared bytes");
    const naive: string[] = [];
    for (const key of ["src-x", "src-x"]) {
      await saveMediaBlob(key, shared);
      naive.push(objectUrlForKey(key, shared));
    }
    expect(new Set(naive).size).toBe(2); // two names for one source
    releaseAllObjectUrls();
  });
});
