import { describe, expect, it } from "vitest";
import { selectAudioBufferEvictionCandidate } from "./useAudioBufferCache";

/**
 * The eviction loop used to be guarded by `cache.size > exceptKeys.size`, which is
 * a count comparison standing in for "is anything evictable". It answered wrong in
 * two different situations, and the cap was then breached silently.
 */

function select(params: {
  cachedKeys: string[];
  exceptKeys?: string[];
  pendingKeys?: string[];
  touchedAt?: Record<string, number>;
}) {
  return selectAudioBufferEvictionCandidate({
    cachedKeys: params.cachedKeys,
    exceptKeys: new Set(params.exceptKeys || []),
    pendingKeys: new Set(params.pendingKeys || []),
    touchedAt: new Map(Object.entries(params.touchedAt || {})),
  });
}

describe("selectAudioBufferEvictionCandidate", () => {
  it("picks the least recently touched key", () => {
    expect(
      select({ cachedKeys: ["a", "b", "c"], touchedAt: { a: 300, b: 100, c: 200 } })
    ).toBe("b");
  });

  it("treats a never-touched key as the oldest", () => {
    expect(select({ cachedKeys: ["a", "fresh"], touchedAt: { fresh: 500 } })).toBe("a");
  });

  it("evicts even when exceptKeys lists more URLs than the cache holds", () => {
    // The old count guard compared 1 > 3 and refused to evict anything, although
    // "a" was evictable and none of the except keys were even cached.
    expect(
      select({ cachedKeys: ["a"], exceptKeys: ["x", "y", "z"], touchedAt: { a: 1 } })
    ).toBe("a");
  });

  it("refuses to drop a key that is in use or still decoding", () => {
    expect(select({ cachedKeys: ["inUse"], exceptKeys: ["inUse"] })).toBeNull();
    expect(select({ cachedKeys: ["decoding"], pendingKeys: ["decoding"] })).toBeNull();
  });

  it("returns null for a single oversized buffer that is in use, so the caller can report", () => {
    // One buffer bigger than the cap cannot be evicted while it is playing; the
    // caller must say so rather than pretend the cap still holds.
    expect(select({ cachedKeys: ["huge"], exceptKeys: ["huge"] })).toBeNull();
  });

  it("returns null on an empty cache", () => {
    expect(select({ cachedKeys: [] })).toBeNull();
  });

  it("skips protected keys but still finds an evictable one behind them", () => {
    expect(
      select({
        cachedKeys: ["keep", "decoding", "old"],
        exceptKeys: ["keep"],
        pendingKeys: ["decoding"],
        touchedAt: { keep: 1, decoding: 2, old: 3 },
      })
    ).toBe("old");
  });
});
