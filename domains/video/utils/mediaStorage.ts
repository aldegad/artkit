// ============================================
// Media File Storage (IndexedDB)
// ============================================

const DB_NAME = "video-media-db";
const STORE_NAME = "media";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Get or create the IndexedDB database
 */
function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbPromise;
}

/**
 * Save a media file (Blob) to IndexedDB
 * @param clipId - The clip ID to use as key
 * @param blob - The file/blob to store
 */
export async function saveMediaBlob(clipId: string, blob: Blob): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, clipId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Load a media file (Blob) from IndexedDB
 * @param clipId - The clip ID used as key
 * @returns The stored Blob or null if not found
 */
export async function loadMediaBlob(clipId: string): Promise<Blob | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(clipId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * Delete a media file from IndexedDB
 * @param clipId - The clip ID used as key
 */
export async function deleteMediaBlob(clipId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(clipId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
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
 * Clear all media files from IndexedDB
 */
export async function clearAllMediaBlobs(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Check if a sourceUrl is stored in IndexedDB (uses idb:// protocol)
 */
export function isStoredMedia(sourceUrl: string): boolean {
  return sourceUrl.startsWith("idb://");
}

/**
 * Get clip ID from stored media URL
 */
export function getClipIdFromStoredUrl(sourceUrl: string): string {
  return sourceUrl.replace("idb://", "");
}

/**
 * Create a stored media URL from clip ID
 */
export function createStoredMediaUrl(clipId: string): string {
  return `idb://${clipId}`;
}
