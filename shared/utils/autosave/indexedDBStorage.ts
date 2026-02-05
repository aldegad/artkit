// ============================================
// IndexedDB Storage Adapter
// ============================================

import type { AutosaveConfig, AutosaveStorage, BaseAutosaveData } from "./types";

/**
 * Create an IndexedDB-based autosave storage
 */
export function createIndexedDBStorage<T extends BaseAutosaveData>(
  config: AutosaveConfig
): AutosaveStorage<T> {
  const {
    key,
    dbName = `${key}-db`,
    storeName = "autosave",
    dbVersion = 1,
  } = config;

  let dbInstance: IDBDatabase | null = null;

  function openDB(): Promise<IDBDatabase> {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("IndexedDB not available"));
        return;
      }

      const request = indexedDB.open(dbName, dbVersion);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      };
    });
  }

  return {
    async load(): Promise<T | null> {
      if (typeof window === "undefined") return null;

      try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const request = store.get(key);

          request.onsuccess = () => {
            const data = request.result as T | undefined;
            resolve(data ?? null);
          };

          request.onerror = () => {
            reject(request.error);
          };
        });
      } catch {
        return null;
      }
    },

    async save(data: Omit<T, "savedAt" | "id">): Promise<void> {
      if (typeof window === "undefined") return;

      try {
        const db = await openDB();

        const dataWithMeta = {
          ...data,
          id: key,
          savedAt: Date.now(),
        } as T;

        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.put(dataWithMeta);

          request.onsuccess = () => {
            resolve();
          };

          request.onerror = () => {
            reject(request.error);
          };
        });
      } catch {
        // Failed to save
      }
    },

    async clear(): Promise<void> {
      if (typeof window === "undefined") return;

      try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.delete(key);

          request.onsuccess = () => {
            resolve();
          };

          request.onerror = () => {
            reject(request.error);
          };
        });
      } catch {
        // Failed to clear
      }
    },
  };
}
