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
  } catch (error) {
    console.error(`[MediaStorage] Failed to save blob "${clipId}":`, error);
    throw error;
  }
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
 * Delete a media file from IndexedDB
 * @param clipId - The clip ID used as key
 */
export async function deleteMediaBlob(clipId: string): Promise<void> {
  await connection.withStore(STORE_NAME, "readwrite", (store) =>
    store.delete(clipId)
  );
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
