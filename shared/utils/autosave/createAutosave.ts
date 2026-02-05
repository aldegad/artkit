// ============================================
// Autosave Factory
// ============================================

import { createIndexedDBStorage } from "./indexedDBStorage";
import { createLocalStorage } from "./localStorageAdapter";
import type {
  AutosaveConfig,
  AutosaveStorage,
  BaseAutosaveData,
  StorageBackend,
} from "./types";

/**
 * Create an autosave storage with the specified backend
 *
 * @example
 * // Using IndexedDB (recommended for large data)
 * const editorAutosave = createAutosave<EditorAutosaveData>({
 *   backend: "indexedDB",
 *   key: "editor-autosave",
 *   dbName: "editor-autosave-db",
 * });
 *
 * @example
 * // Using localStorage (simpler, but limited storage)
 * const spriteAutosave = createAutosave<SpriteAutosaveData>({
 *   backend: "localStorage",
 *   key: "sprite-editor-autosave",
 * });
 */
export function createAutosave<T extends BaseAutosaveData>(
  options: AutosaveConfig & { backend: StorageBackend }
): AutosaveStorage<T> {
  const { backend, ...config } = options;

  switch (backend) {
    case "indexedDB":
      return createIndexedDBStorage<T>(config);
    case "localStorage":
      return createLocalStorage<T>(config);
    default:
      throw new Error(`Unknown storage backend: ${backend}`);
  }
}
