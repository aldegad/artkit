// ============================================
// LocalStorage Storage Adapter
// ============================================

import type { AutosaveConfig, AutosaveStorage, BaseAutosaveData } from "./types";

/**
 * Create a localStorage-based autosave storage
 */
export function createLocalStorage<T extends BaseAutosaveData>(
  config: AutosaveConfig
): AutosaveStorage<T> {
  const { key } = config;

  return {
    async load(): Promise<T | null> {
      if (typeof window === "undefined") return null;

      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const data: T = JSON.parse(saved);
          return data;
        }
      } catch {
        // Failed to load saved data
      }
      return null;
    },

    async save(data: Omit<T, "savedAt" | "id">): Promise<void> {
      if (typeof window === "undefined") return;

      try {
        const dataWithMeta = {
          ...data,
          id: key,
          savedAt: Date.now(),
        } as T;

        localStorage.setItem(key, JSON.stringify(dataWithMeta));
      } catch {
        // Failed to save
      }
    },

    async clear(): Promise<void> {
      if (typeof window === "undefined") return;

      localStorage.removeItem(key);
    },
  };
}
