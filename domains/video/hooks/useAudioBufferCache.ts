"use client";

import { useEffect } from "react";
import { Clip } from "../types";

// --- Module-level shared state (same pattern as usePreRenderCache) ---

let sharedAudioContext: AudioContext | null = null;

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
  return audioBufferCache.get(sourceUrl) ?? null;
}

/** Check if AudioBuffer is ready for a sourceUrl. */
export function isAudioBufferReady(sourceUrl: string): boolean {
  return audioBufferCache.has(sourceUrl);
}

/**
 * Decode audio from a media URL and cache the resulting AudioBuffer.
 * De-duplicates concurrent requests for the same URL.
 */
async function decodeAudioBuffer(
  sourceUrl: string
): Promise<AudioBuffer | null> {
  if (audioBufferCache.has(sourceUrl)) {
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

/** Remove a cached AudioBuffer. */
export function removeAudioBuffer(sourceUrl: string): void {
  audioBufferCache.delete(sourceUrl);
  emitAudioCacheStatus();
}

/** Clear the entire AudioBuffer cache. */
export function clearAudioBufferCache(): void {
  audioBufferCache.clear();
  decodePending.clear();
  emitAudioCacheStatus();
}

// --- React Hook ---

/**
 * Automatically decode and cache AudioBuffers for all audible clips.
 * Call once in the preview component — it watches clip changes and
 * pre-decodes audio so that useWebAudioPlayback can use them instantly.
 */
export function useAudioBufferCache(clips: Clip[]): void {
  useEffect(() => {
    const audibleSourceUrls = new Set<string>();

    for (const clip of clips) {
      if (clip.type === "audio") {
        audibleSourceUrls.add(clip.sourceUrl);
      } else if (clip.type === "video" && (clip.hasAudio ?? true)) {
        audibleSourceUrls.add(clip.sourceUrl);
      }
    }

    for (const sourceUrl of audibleSourceUrls) {
      if (!audioBufferCache.has(sourceUrl) && !decodePending.has(sourceUrl)) {
        decodeAudioBuffer(sourceUrl);
      }
    }
  }, [clips]);
}
