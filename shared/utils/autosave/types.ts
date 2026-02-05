// ============================================
// Autosave Types
// ============================================

/**
 * Base interface for autosave data
 * Domain-specific data extends this
 */
export interface BaseAutosaveData {
  id: string;
  savedAt: number;
}

/**
 * Storage adapter interface
 */
export interface AutosaveStorage<T extends BaseAutosaveData> {
  load(): Promise<T | null>;
  save(data: Omit<T, "savedAt" | "id">): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Storage backend types
 */
export type StorageBackend = "indexedDB" | "localStorage";

/**
 * Configuration for autosave
 */
export interface AutosaveConfig {
  key: string;
  dbName?: string; // For IndexedDB
  storeName?: string; // For IndexedDB
  dbVersion?: number; // For IndexedDB
}
