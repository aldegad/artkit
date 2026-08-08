// ============================================
// Media File Storage (IndexedDB)
// ============================================

import { createIDBConnection } from "@/shared/utils/idb";

const DB_NAME = "video-media-db";
const STORE_NAME = "media";
const DB_VERSION = 1;

const connection = createIDBConnection({
  dbName: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (db) => {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME);
    }
  },
});

async function normalizeBlobForStorage(blob: Blob): Promise<Blob> {
  if (!(blob instanceof File)) {
    return blob;
  }

  const buffer = await blob.arrayBuffer();
  return new Blob([buffer], { type: blob.type });
}

/**
 * Save a media file (Blob) to IndexedDB
 * @param clipId - The clip ID to use as key
 * @param blob - The file/blob to store
 */
export async function saveMediaBlob(clipId: string, blob: Blob): Promise<void> {
  const storedBlob = await normalizeBlobForStorage(blob);
  try {
    await connection.withStore(STORE_NAME, "readwrite", (store) =>
      store.put(storedBlob, clipId)
    );
    // Same key, different bytes (inpaint output, re-import): stop handing out the
    // cached name, but do NOT revoke it — a sibling clip from a razor split may still
    // be playing those original bytes through that very URL.
    forgetObjectUrlForKey(clipId);
  } catch (error) {
    console.error(`[MediaStorage] Failed to save blob "${clipId}":`, error);
    throw error;
  }
}

/**
 * Store bytes and get their name, once per key, for one load pass.
 *
 * `saveMediaBlob` deliberately forgets a key's cached URL (same name, possibly new
 * bytes), so calling save-then-name per CLIP re-mints every time and the key-based
 * cache degrades to `URL.createObjectURL` — k clips sharing a source produce k names
 * again (validator reject, 2026-08-08). Moving the mint before the save does not help
 * either: the save that follows clears it for the next clip.
 *
 * A per-key promise is what the sequence actually needs, and it must be a promise
 * because loaders run clips through `mapWithConcurrency`. Scope one resolver per load
 * pass — a module-global would outlive the project it named.
 */
export function createMediaUrlResolver(): (key: string, blob: Blob) => Promise<string> {
  const inflight = new Map<string, Promise<string>>();

  return (key, blob) => {
    const existing = inflight.get(key);
    if (existing) return existing;

    const pending = (async () => {
      await saveMediaBlob(key, blob);
      return objectUrlForKey(key, blob);
    })();
    inflight.set(key, pending);
    return pending;
  };
}

/**
 * Load a media file (Blob) from IndexedDB
 * @param clipId - The clip ID used as key
 * @returns The stored Blob or null if not found
 */
export async function loadMediaBlob(clipId: string): Promise<Blob | null> {
  const result = await connection.withStore<Blob | undefined>(
    STORE_NAME,
    "readonly",
    (store) => store.get(clipId)
  );
  if (!result) return null;
  try {
    return await normalizeBlobForStorage(result);
  } catch {
    return null;
  }
}

/**
 * Load first available media blob for the provided keys.
 * Useful while migrating from clip-owned blobs to source-owned blobs.
 */
export async function loadMediaBlobFromKeys(
  keys: Array<string | null | undefined>
): Promise<Blob | null> {
  const uniqueKeys = Array.from(
    new Set(
      keys
        .map((key) => (typeof key === "string" ? key.trim() : ""))
        .filter((key) => key.length > 0)
    )
  );

  for (const key of uniqueKeys) {
    const blob = await loadMediaBlob(key);
    if (blob) return blob;
  }

  return null;
}

/**
 * Blob key priority for one clip: its own bytes first, then its shared source.
 *
 * A clip owns bytes under its own id when the editor produced them for that clip
 * alone (frame capture, inpaint output, gap interpolation); it falls back to the
 * source id for imported media shared by several clips. This order is the rule,
 * and it lives here because blob keys are this module's concern — every consumer
 * must resolve the same way or they disagree about what a clip plays.
 */
export function mediaBlobKeysForClip(clip: {
  id: string;
  sourceId?: string | null;
}): string[] {
  return Array.from(
    new Set(
      [clip.id, clip.sourceId]
        .map((key) => (typeof key === "string" ? key.trim() : ""))
        .filter((key) => key.length > 0)
    )
  );
}

/**
 * Load a clip's media and report WHICH key held it.
 *
 * Callers that only need the bytes can ignore `key`; callers that have to name
 * the blob (bundle export) need it, and deriving it separately would fork the
 * priority rule above.
 */
export async function loadMediaBlobForClip(clip: {
  id: string;
  sourceId?: string | null;
}): Promise<{ blob: Blob; key: string } | null> {
  for (const key of mediaBlobKeysForClip(clip)) {
    const blob = await loadMediaBlob(key);
    if (blob) return { blob, key };
  }
  return null;
}

/**
 * One objectURL per STORAGE KEY, reused.
 *
 * `URL.createObjectURL` mints a new name every call, so creating one per CLIP gave
 * the same bytes several names (measured: 16 clips over 3 sources produced 14
 * distinct URLs). Media elements are pooled per source and compare the incoming
 * `clip.sourceUrl` against the one they hold, so every clip handing over a different
 * name for the same bytes forced `src = …` + `load()` again — 224 src assignments in
 * three seconds of playback.
 *
 * Keyed by the blob key, NOT by the Blob object: reading the same record twice
 * returns two different Blob instances (`normalizeBlobForStorage` rebuilds it), so a
 * WeakMap keyed on the blob misses every time and changes nothing. The storage key
 * is the stable identity here — that is what the rest of this module already treats
 * as the name of the bytes.
 */
const objectUrlByKey = new Map<string, string>();

export function objectUrlForKey(key: string, blob: Blob): string {
  const existing = objectUrlByKey.get(key);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  objectUrlByKey.set(key, url);
  return url;
}

/**
 * Stop naming a key without killing the name already handed out.
 *
 * After a razor split two clips share one cache entry (`{ ...clip }` spread), so the
 * cache cannot tell how many holders a URL has. Revoking on overwrite killed the URL
 * a sibling was still playing (validator note, 2026-08-08: split, then inpaint the
 * first half, and the second half went dead).
 *
 * Forgetting is the correct semantics for an overwrite anyway: the clip that was NOT
 * edited still plays the ORIGINAL bytes, so its URL must keep pointing at them. New
 * lookups mint a fresh name for the new bytes. The cost is that the old name is never
 * revoked — a bounded leak per edit, which is the cheaper side of the trade against
 * breaking playback, and far cheaper than refcounting holders.
 */
export function forgetObjectUrlForKey(key: string): void {
  objectUrlByKey.delete(key);
}

/** Release a key's objectURL, if one was handed out. */
export function releaseObjectUrlForKey(key: string): void {
  const existing = objectUrlByKey.get(key);
  if (!existing) return;
  objectUrlByKey.delete(key);
  URL.revokeObjectURL(existing);
}

/**
 * Move a key's objectURL to a new key WITHOUT revoking it.
 *
 * Renaming bytes is not deleting them. Razor split calls `moveMediaBlob`, whose last
 * step deletes the source key — and both split halves are `{ ...clip }` spreads that
 * still carry the original `sourceUrl` (`razorSplit.ts:66,76`). Revoking on that
 * delete killed a URL two live clips were pointing at (validator reject, 2026-08-08).
 *
 * Renaming first also makes the later delete's release a no-op, so there is no second
 * rule to keep in sync.
 */
export function renameObjectUrlKey(fromKey: string, toKey: string): void {
  if (fromKey === toKey) return;
  const existing = objectUrlByKey.get(fromKey);
  if (!existing) return;
  const replaced = objectUrlByKey.get(toKey);
  if (replaced && replaced !== existing) {
    URL.revokeObjectURL(replaced);
  }
  objectUrlByKey.delete(fromKey);
  objectUrlByKey.set(toKey, existing);
}

/** Release every objectURL handed out so far (project switch, teardown). */
export function releaseAllObjectUrls(): void {
  for (const url of objectUrlByKey.values()) {
    URL.revokeObjectURL(url);
  }
  objectUrlByKey.clear();
}

/**
 * Delete a media file from IndexedDB
 * @param clipId - The clip ID used as key
 */
export async function deleteMediaBlob(clipId: string): Promise<void> {
  await connection.withStore(STORE_NAME, "readwrite", (store) =>
    store.delete(clipId)
  );
  // The URL names these bytes; when they go, it must go too.
  releaseObjectUrlForKey(clipId);
}

/**
 * Copy a media blob from one clip ID to another.
 * Returns true when source blob exists and copy succeeds.
 */
export async function copyMediaBlob(
  sourceClipId: string,
  targetClipId: string
): Promise<boolean> {
  const blob = await loadMediaBlob(sourceClipId);
  if (!blob) return false;
  await saveMediaBlob(targetClipId, blob);
  return true;
}

/**
 * Move a media blob from one clip ID to another.
 * Returns true when source blob exists and move succeeds.
 */
export async function moveMediaBlob(
  sourceClipId: string,
  targetClipId: string
): Promise<boolean> {
  const blob = await loadMediaBlob(sourceClipId);
  if (!blob) return false;
  await saveMediaBlob(targetClipId, blob);
  // The bytes did not go away, only their name changed. Hand the live URL over
  // before deleting, so clips still holding it keep working and the delete below
  // finds nothing left to release.
  renameObjectUrlKey(sourceClipId, targetClipId);
  if (sourceClipId !== targetClipId) {
    await deleteMediaBlob(sourceClipId);
  }
  return true;
}

/**
 * Clear all media files from IndexedDB
 */
export async function clearAllMediaBlobs(): Promise<void> {
  await connection.withStore(STORE_NAME, "readwrite", (store) =>
    store.clear()
  );
  releaseAllObjectUrls();
}

/**
 * Check if a sourceUrl is stored in IndexedDB (uses idb:// protocol)
 */
export function isStoredMedia(sourceUrl?: string | null): boolean {
  return typeof sourceUrl === "string" && sourceUrl.startsWith("idb://");
}

/**
 * Get clip ID from stored media URL
 */
export function getClipIdFromStoredUrl(sourceUrl?: string | null): string {
  return typeof sourceUrl === "string" ? sourceUrl.replace("idb://", "") : "";
}

/**
 * Create a stored media URL from clip ID
 */
export function createStoredMediaUrl(clipId: string): string {
  return `idb://${clipId}`;
}
