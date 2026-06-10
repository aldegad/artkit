// ============================================
// IndexedDB Storage Adapter
// ============================================

import { createIDBConnection, type IDBConnection } from "../idb";
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

  let connection: IDBConnection | null = null;

  function getConnection(): IDBConnection {
    if (!connection) {
      connection = createIDBConnection({
        dbName,
        version: dbVersion,
        onUpgrade: (db) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: "id" });
          }
        },
      });
    }
    return connection;
  }

  return {
    async load(): Promise<T | null> {
      if (typeof window === "undefined") return null;

      try {
        const data = await getConnection().withStore<T | undefined>(
          storeName,
          "readonly",
          (store) => store.get(key)
        );
        return data ?? null;
      } catch (error) {
        // Restore stays non-fatal, but the failure must be observable.
        console.error(`[Autosave] Failed to load "${key}":`, error);
        return null;
      }
    },

    async save(data: Omit<T, "savedAt" | "id">): Promise<void> {
      if (typeof window === "undefined") return;

      const dataWithMeta = {
        ...data,
        id: key,
        savedAt: Date.now(),
      } as T;

      try {
        await getConnection().withStore(storeName, "readwrite", (store) =>
          store.put(dataWithMeta)
        );
      } catch (error) {
        console.error(`[Autosave] Failed to save "${key}":`, error);
        throw error;
      }
    },

    async clear(): Promise<void> {
      if (typeof window === "undefined") return;

      try {
        await getConnection().withStore(storeName, "readwrite", (store) =>
          store.delete(key)
        );
      } catch (error) {
        console.error(`[Autosave] Failed to clear "${key}":`, error);
        throw error;
      }
    },
  };
}
