import { SavedVideoProject } from "@/domains/video/types/project";
import { createIDBConnection } from "@/shared/utils/idb";

// ============================================
// IndexedDB Storage for Video Editor
// ============================================

const DB_NAME = "video-projects-db";
const DB_VERSION = 1;
const STORE_NAME = "video-projects";

const connection = createIDBConnection({
  dbName: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (db) => {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("savedAt", "savedAt", { unique: false });
      store.createIndex("name", "name", { unique: false });
    }
  },
});

/**
 * Save a video project to IndexedDB
 */
export async function saveVideoProject(project: SavedVideoProject): Promise<void> {
  try {
    await connection.withStore(STORE_NAME, "readwrite", (store) =>
      store.put(project)
    );
  } catch (error) {
    console.error("[VideoStorage] Failed to save project:", error);
    throw error;
  }
}

/**
 * Get all saved video projects from IndexedDB
 */
export async function getAllVideoProjects(): Promise<SavedVideoProject[]> {
  try {
    const projects = await connection.withStore<SavedVideoProject[]>(
      STORE_NAME,
      "readonly",
      (store) =>
        (store.indexNames.contains("savedAt") ? store.index("savedAt") : store).getAll()
    );
    projects.sort(
      (a, b) => (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0)
    );
    return projects;
  } catch (error) {
    console.error("[VideoStorage] Failed to get projects:", error);
    throw error;
  }
}

/**
 * Get a single video project by ID
 */
export async function getVideoProject(id: string): Promise<SavedVideoProject | undefined> {
  try {
    return await connection.withStore<SavedVideoProject | undefined>(
      STORE_NAME,
      "readonly",
      (store) => store.get(id)
    );
  } catch (error) {
    console.error("[VideoStorage] Failed to get project:", error);
    throw error;
  }
}

/**
 * Delete a video project by ID
 */
export async function deleteVideoProject(id: string): Promise<void> {
  try {
    await connection.withStore(STORE_NAME, "readwrite", (store) =>
      store.delete(id)
    );
  } catch (error) {
    console.error("[VideoStorage] Failed to delete project:", error);
    throw error;
  }
}
