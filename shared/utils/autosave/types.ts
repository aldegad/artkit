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
 * Configuration for autosave (IndexedDB)
 */
export interface AutosaveConfig {
  key: string;
  dbName?: string;
  storeName?: string;
  dbVersion?: number;
}
