"use client";

import { useEffect } from "react";

// --- Module-level shared state (same pattern as usePreRenderCache) ---

let sharedAudioContext: AudioContext | null = null;
const AUDIO_BUFFER_MAX_BYTES = 96 * 1024 * 1024;
const audioBufferSizeBySource = new Map<string, number>();
const audioBufferTouchedAt = new Map<string, number>();
let audioBufferTotalBytes = 0;

/** Get or create the shared AudioContext (lazy init). */
export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
}

// AudioBuffer cache: sourceUrl -> decoded AudioBuffer
const audioBufferCache = new Map<string, AudioBuffer>();

// In-flight decode promises (prevent duplicate decode requests)
const decodePending = new Map<string, Promise<AudioBuffer | null>>();

// Event emitter for cache status (UI indicators if needed)
type AudioCacheListener = () => void;
const cacheListeners = new Set<AudioCacheListener>();

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function estimateAudioBufferBytes(buffer: AudioBuffer): number {
  return Math.max(1, buffer.length * Math.max(1, buffer.numberOfChannels) * 4);
}

function touchAudioBuffer(sourceUrl: string) {
  audioBufferTouchedAt.set(sourceUrl, nowMs());
}

/**
 * Least-recently-touched cached key that may be dropped, or null when none may.
 *
 * Pulled out as a pure function because the eviction loop's old guard was wrong in
 * two ways at once and neither was visible from the loop body: it compared
 * `cache.size > exceptKeys.size`, so (a) a single entry larger than the cap was
 * never considered, and (b) `exceptKeys` holding URLs that are not even cached made
 * the count comparison false while evictable entries sat right there.
 */
export function selectAudioBufferEvictionCandidate(params: {
  cachedKeys: Iterable<string>;
  exceptKeys: { has(key: string): boolean };
  pendingKeys: { has(key: string): boolean };
  touchedAt: Map<string, number>;
}): string | null {
  const { cachedKeys, exceptKeys, pendingKeys, touchedAt } = params;
  let candidateKey: string | null = null;
  let oldestTouch = Number.POSITIVE_INFINITY;

  for (const sourceUrl of cachedKeys) {
    if (exceptKeys.has(sourceUrl) || pendingKeys.has(sourceUrl)) continue;
    const seenAt = touchedAt.get(sourceUrl) ?? 0;
    if (seenAt < oldestTouch) {
      oldestTouch = seenAt;
      candidateKey = sourceUrl;
    }
  }

  return candidateKey;
}

/**
 * The full eviction decision: which keys to drop, in order, and whether the cap is
 * still breached afterwards.
 *
 * The loop lives here rather than in the imperative shell because the shell's exit
 * condition is exactly what was wrong before (a count comparison standing in for
 * "is anything evictable"). Pinning only the per-step candidate left that condition
 * untested — a re-added count guard would keep every test green (validator note,
 * 2026-08-08). With the whole decision pure, the shell has no condition to get wrong.
 */
export function planAudioBufferEvictions(params: {
  totalBytes: number;
  maxBytes: number;
  sizeOf: (key: string) => number;
  cachedKeys: Iterable<string>;
  exceptKeys: { has(key: string): boolean };
  pendingKeys: { has(key: string): boolean };
  touchedAt: Map<string, number>;
}): { evict: string[]; remainingBytes: number; capBreached: boolean } {
  const { totalBytes, maxBytes, sizeOf, exceptKeys, pendingKeys, touchedAt } = params;
  const remaining = new Set(params.cachedKeys);
  const evict: string[] = [];
  let bytes = totalBytes;

  while (bytes > maxBytes) {
    const candidateKey = selectAudioBufferEvictionCandidate({
      cachedKeys: remaining,
      exceptKeys,
      pendingKeys,
      touchedAt,
    });
    if (!candidateKey) break;
    remaining.delete(candidateKey);
    evict.push(candidateKey);
    bytes -= sizeOf(candidateKey);
  }

  return { evict, remainingBytes: bytes, capBreached: bytes > maxBytes };
}

let reportedCapBreachBytes = 0;

function evictAudioBuffers(exceptKeys: Set<string> = new Set()) {
  const plan = planAudioBufferEvictions({
    totalBytes: audioBufferTotalBytes,
    maxBytes: AUDIO_BUFFER_MAX_BYTES,
    sizeOf: (key) => audioBufferSizeBySource.get(key) ?? 0,
    cachedKeys: audioBufferCache.keys(),
    exceptKeys,
    pendingKeys: decodePending,
    touchedAt: audioBufferTouchedAt,
  });

  for (const key of plan.evict) {
    removeAudioBuffer(key);
  }

  if (plan.capBreached) {
    // A single buffer can exceed the cap on its own (10 minutes of 48kHz stereo is
    // ~230MB) and cannot be dropped while in use. Holding a breached cap silently
    // hides memory growth, so say it once per high-water level.
    if (audioBufferTotalBytes > reportedCapBreachBytes) {
      reportedCapBreachBytes = audioBufferTotalBytes;
      console.warn(
        `[AudioBufferCache] over cap and nothing evictable: ${Math.round(audioBufferTotalBytes / 1024 / 1024)}MB > ${Math.round(AUDIO_BUFFER_MAX_BYTES / 1024 / 1024)}MB (${audioBufferCache.size} buffer(s) in use)`,
      );
    }
  } else {
    reportedCapBreachBytes = 0;
  }
}

function emitAudioCacheStatus() {
  for (const listener of cacheListeners) {
    listener();
  }
}

export function subscribeAudioCacheStatus(
  listener: AudioCacheListener
): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

/** Get a cached AudioBuffer for a sourceUrl (null if not yet decoded). */
export function getAudioBuffer(sourceUrl: string): AudioBuffer | null {
  const cached = audioBufferCache.get(sourceUrl) ?? null;
  if (cached) {
    touchAudioBuffer(sourceUrl);
  }
  return cached;
}

/** Check if AudioBuffer is ready for a sourceUrl. */
export function isAudioBufferReady(sourceUrl: string): boolean {
  const ready = audioBufferCache.has(sourceUrl);
  if (ready) {
    touchAudioBuffer(sourceUrl);
  }
  return ready;
}

/**
 * Decode audio from a media URL and cache the resulting AudioBuffer.
 * De-duplicates concurrent requests for the same URL.
 */
async function decodeAudioBuffer(
  sourceUrl: string
): Promise<AudioBuffer | null> {
  if (audioBufferCache.has(sourceUrl)) {
    touchAudioBuffer(sourceUrl);
    return audioBufferCache.get(sourceUrl)!;
  }
  if (decodePending.has(sourceUrl)) {
    return decodePending.get(sourceUrl)!;
  }

  const promise = (async () => {
    try {
      const ctx = getSharedAudioContext();
      // Resume if suspended (browser autoplay policy)
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const response = await fetch(sourceUrl);
      const arrayBuffer = await response.arrayBuffer();
      // decodeAudioData detaches the ArrayBuffer, so slice() to keep original
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      audioBufferCache.set(sourceUrl, audioBuffer);
      audioBufferSizeBySource.set(sourceUrl, estimateAudioBufferBytes(audioBuffer));
      audioBufferTotalBytes += audioBufferSizeBySource.get(sourceUrl) ?? 0;
      touchAudioBuffer(sourceUrl);
      evictAudioBuffers(new Set([sourceUrl]));
      emitAudioCacheStatus();
      return audioBuffer;
    } catch {
      // Decode failure (e.g. image clip, corrupt file) — silently skip
      return null;
    } finally {
      decodePending.delete(sourceUrl);
    }
  })();

  decodePending.set(sourceUrl, promise);
  return promise;
}

export function getOrDecodeAudioBuffer(sourceUrl: string): Promise<AudioBuffer | null> {
  return decodeAudioBuffer(sourceUrl);
}

/** Remove a cached AudioBuffer. */
export function removeAudioBuffer(sourceUrl: string): void {
  const size = audioBufferSizeBySource.get(sourceUrl) ?? 0;
  audioBufferCache.delete(sourceUrl);
  audioBufferSizeBySource.delete(sourceUrl);
  audioBufferTouchedAt.delete(sourceUrl);
  audioBufferTotalBytes = Math.max(0, audioBufferTotalBytes - size);
  emitAudioCacheStatus();
}

/** Clear the entire AudioBuffer cache. */
export function clearAudioBufferCache(): void {
  audioBufferCache.clear();
  decodePending.clear();
  audioBufferSizeBySource.clear();
  audioBufferTouchedAt.clear();
  audioBufferTotalBytes = 0;
  emitAudioCacheStatus();
}

// --- React Hook ---

/**
 * Lazily decode and cache AudioBuffers only for the currently warm playback window.
 * Call once in the preview component with nearby source URLs so WebAudio can
 * start quickly without eagerly decoding the entire timeline.
 */
export function useAudioBufferCache(
  options?: { enabled?: boolean; warmSourceUrls?: string[] }
): void {
  const enabled = options?.enabled ?? true;
  const warmSourceUrlsSerialized = JSON.stringify(options?.warmSourceUrls ?? []);

  useEffect(() => {
    if (!enabled) return;

    const warmSourceUrls: string[] = JSON.parse(warmSourceUrlsSerialized);
    const preferredSourceUrls = new Set<string>();
    for (const sourceUrl of warmSourceUrls) {
      if (typeof sourceUrl === "string" && sourceUrl.length > 0) {
        preferredSourceUrls.add(sourceUrl);
      }
    }

    for (const sourceUrl of preferredSourceUrls) {
      if (!audioBufferCache.has(sourceUrl) && !decodePending.has(sourceUrl)) {
        void decodeAudioBuffer(sourceUrl);
      }
    }

    evictAudioBuffers(preferredSourceUrls);
  }, [enabled, warmSourceUrlsSerialized]);
}
