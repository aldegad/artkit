import { describe, expect, it } from "vitest";
import { planAudioBufferEvictions, selectAudioBufferEvictionCandidate } from "./useAudioBufferCache";

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

function plan(params: {
  totalBytes: number;
  maxBytes?: number;
  sizes: Record<string, number>;
  exceptKeys?: string[];
  pendingKeys?: string[];
  touchedAt?: Record<string, number>;
}) {
  return planAudioBufferEvictions({
    totalBytes: params.totalBytes,
    maxBytes: params.maxBytes ?? 100,
    sizeOf: (key) => params.sizes[key] ?? 0,
    cachedKeys: Object.keys(params.sizes),
    exceptKeys: new Set(params.exceptKeys || []),
    pendingKeys: new Set(params.pendingKeys || []),
    touchedAt: new Map(Object.entries(params.touchedAt || {})),
  });
}

/**
 * These cover the LOOP, not just the per-step choice. The bug was in the loop's exit
 * condition, so pinning only the candidate picker left the actual defect untested.
 */
describe("planAudioBufferEvictions", () => {
  it("evicts oldest-first until the cap is met, and no further", () => {
    const result = plan({
      totalBytes: 180,
      sizes: { old: 50, mid: 40, newest: 90 },
      touchedAt: { old: 1, mid: 2, newest: 3 },
    });
    expect(result.evict).toEqual(["old", "mid"]);
    expect(result.remainingBytes).toBe(90);
    expect(result.capBreached).toBe(false);
  });

  it("does nothing when already under the cap", () => {
    const result = plan({ totalBytes: 50, sizes: { a: 50 }, touchedAt: { a: 1 } });
    expect(result.evict).toEqual([]);
    expect(result.capBreached).toBe(false);
  });

  it("reports a breach when the only buffer over the cap is in use", () => {
    // This is the case the old count guard skipped entirely.
    const result = plan({ totalBytes: 230, sizes: { huge: 230 }, exceptKeys: ["huge"] });
    expect(result.evict).toEqual([]);
    expect(result.capBreached).toBe(true);
    expect(result.remainingBytes).toBe(230);
  });

  it("still evicts when exceptKeys names more URLs than the cache holds", () => {
    // The old guard compared cache.size (1) > exceptKeys.size (3) and refused.
    const result = plan({
      totalBytes: 150,
      sizes: { a: 150 },
      exceptKeys: ["x", "y", "z"],
      touchedAt: { a: 1 },
    });
    expect(result.evict).toEqual(["a"]);
    expect(result.capBreached).toBe(false);
  });

  it("terminates when a size is unknown (0) instead of looping forever", () => {
    const result = plan({ totalBytes: 200, sizes: { unknown: 0, other: 0 }, touchedAt: { unknown: 1, other: 2 } });
    expect(result.evict).toEqual(["unknown", "other"]);
    expect(result.capBreached).toBe(true);
  });

  it("skips in-use and decoding buffers but drains the rest", () => {
    const result = plan({
      totalBytes: 300,
      sizes: { keep: 120, decoding: 80, dropA: 60, dropB: 40 },
      exceptKeys: ["keep"],
      pendingKeys: ["decoding"],
      touchedAt: { keep: 4, decoding: 3, dropA: 1, dropB: 2 },
    });
    expect(result.evict).toEqual(["dropA", "dropB"]);
    expect(result.remainingBytes).toBe(200);
    expect(result.capBreached).toBe(true);
  });
});
