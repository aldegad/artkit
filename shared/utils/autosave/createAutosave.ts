// ============================================
// Autosave Factory (IndexedDB)
// ============================================

import { createIndexedDBStorage } from "./indexedDBStorage";
import type {
  AutosaveConfig,
  AutosaveStorage,
  BaseAutosaveData,
} from "./types";

/**
 * Create an autosave storage using IndexedDB
 *
 * @example
 * const editorAutosave = createAutosave<EditorAutosaveData>({
 *   key: "image-editor-autosave",
 *   dbName: "image-editor-autosave-db",
 * });
 *
 * await editorAutosave.save(data);
 * const loaded = await editorAutosave.load();
 */
export function createAutosave<T extends BaseAutosaveData>(
  config: AutosaveConfig
): AutosaveStorage<T> {
  return createIndexedDBStorage<T>(config);
}
