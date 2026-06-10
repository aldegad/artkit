import { SavedSpriteProject } from "@/domains/sprite/types";
import { SavedImageProject } from "@/domains/image/types";
import { createIDBConnection } from "./idb";

// ============================================
// IndexedDB Storage for Sprite + Image Projects
// ============================================

const DB_NAME = "artkit-projects-db";
const DB_VERSION = 3; // Bump version for store rename
const SPRITE_STORE_NAME = "sprite-projects";
const IMAGE_STORE_NAME = "image-projects";

const connection = createIDBConnection({
  dbName: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (db) => {
    // Create sprite-projects store
    if (!db.objectStoreNames.contains(SPRITE_STORE_NAME)) {
      const store = db.createObjectStore(SPRITE_STORE_NAME, { keyPath: "id" });
      store.createIndex("savedAt", "savedAt", { unique: false });
      store.createIndex("name", "name", { unique: false });
      console.log("[IndexedDB] Created sprite-projects store");
    }

    // Create image-projects store (image editor)
    if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
      const store = db.createObjectStore(IMAGE_STORE_NAME, { keyPath: "id" });
      store.createIndex("savedAt", "savedAt", { unique: false });
      store.createIndex("name", "name", { unique: false });
      console.log("[IndexedDB] Created image-projects store");
    }
  },
});

/**
 * Save a project to IndexedDB
 */
export async function saveProject(project: SavedSpriteProject): Promise<void> {
  try {
    await connection.withStore(SPRITE_STORE_NAME, "readwrite", (store) =>
      store.put(project)
    );
    console.log("[IndexedDB] Project saved:", project.name);
  } catch (error) {
    console.error("[IndexedDB] Failed to save project:", error);
    throw error;
  }
}

/**
 * Get all saved projects from IndexedDB
 */
export async function getAllProjects(): Promise<SavedSpriteProject[]> {
  try {
    const projects = await connection.withStore<SavedSpriteProject[]>(
      SPRITE_STORE_NAME,
      "readonly",
      (store) =>
        (store.indexNames.contains("savedAt") ? store.index("savedAt") : store).getAll()
    );
    // Sort by savedAt descending (newest first)
    projects.sort(
      (a, b) => (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0)
    );
    return projects;
  } catch (error) {
    console.error("[IndexedDB] Failed to get projects:", error);
    throw error;
  }
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string): Promise<SavedSpriteProject | undefined> {
  try {
    return await connection.withStore<SavedSpriteProject | undefined>(
      SPRITE_STORE_NAME,
      "readonly",
      (store) => store.get(id)
    );
  } catch (error) {
    console.error("[IndexedDB] Failed to get project:", error);
    throw error;
  }
}

/**
 * Delete a project by ID
 */
export async function deleteProject(id: string): Promise<void> {
  try {
    await connection.withStore(SPRITE_STORE_NAME, "readwrite", (store) =>
      store.delete(id)
    );
    console.log("[IndexedDB] Project deleted:", id);
  } catch (error) {
    console.error("[IndexedDB] Failed to delete project:", error);
    throw error;
  }
}

/**
 * Clear all projects
 */
export async function clearAllProjects(): Promise<void> {
  try {
    await connection.withStore(SPRITE_STORE_NAME, "readwrite", (store) =>
      store.clear()
    );
    console.log("[IndexedDB] All projects cleared");
  } catch (error) {
    console.error("[IndexedDB] Failed to clear projects:", error);
    throw error;
  }
}

/**
 * Get storage usage info
 */
export async function getStorageInfo(): Promise<{
  used: number;
  quota: number;
  percentage: number;
}> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentage = quota > 0 ? (used / quota) * 100 : 0;
    return { used, quota, percentage };
  }

  return { used: 0, quota: 0, percentage: 0 };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ============================================
// Export/Import Functions
// ============================================

interface ExportData {
  version: number;
  exportedAt: number;
  projects: SavedSpriteProject[];
}

/**
 * Export all projects from IndexedDB as JSON file
 */
export async function exportAllProjectsToJSON(): Promise<void> {
  const projects = await getAllProjects();

  if (projects.length === 0) {
    throw new Error("내보낼 프로젝트가 없습니다.");
  }

  const exportData: ExportData = {
    version: 1,
    exportedAt: Date.now(),
    projects,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `sprite-projects-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.log(`[IndexedDB] Exported ${projects.length} projects`);
}

/**
 * Import projects from JSON file
 * @param file - JSON file containing exported projects
 * @param overwrite - If true, clears existing projects before import
 * @returns Number of imported projects
 */
export async function importProjectsFromJSON(
  file: File,
  overwrite: boolean = false,
): Promise<{ imported: number; skipped: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const jsonString = event.target?.result as string;
        const data = JSON.parse(jsonString) as ExportData;

        // Validate export data
        if (!data.version || !Array.isArray(data.projects)) {
          throw new Error("잘못된 백업 파일 형식입니다.");
        }

        // Clear existing projects if overwrite is true
        if (overwrite) {
          await clearAllProjects();
        }

        // Get existing project IDs to check for duplicates
        const existingProjects = await getAllProjects();
        const existingIds = new Set(existingProjects.map((p) => p.id));

        let imported = 0;
        let skipped = 0;

        for (const project of data.projects) {
          // Skip if project already exists and not overwriting
          if (!overwrite && existingIds.has(project.id)) {
            skipped++;
            continue;
          }

          await saveProject(project);
          imported++;
        }

        console.log(`[IndexedDB] Imported ${imported} projects, skipped ${skipped}`);
        resolve({ imported, skipped });
      } catch (error) {
        console.error("[IndexedDB] Import failed:", error);
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("파일 읽기 실패"));
    };

    reader.readAsText(file);
  });
}

// ============================================
// Image Editor Storage Functions
// ============================================

/**
 * Save an image editor project to IndexedDB
 */
export async function saveImageProject(project: SavedImageProject): Promise<void> {
  try {
    await connection.withStore(IMAGE_STORE_NAME, "readwrite", (store) =>
      store.put(project)
    );
    console.log("[IndexedDB] Image project saved:", project.name);
  } catch (error) {
    console.error("[IndexedDB] Failed to save image project:", error);
    throw error;
  }
}

/**
 * Get all saved image editor projects from IndexedDB
 */
export async function getAllImageProjects(): Promise<SavedImageProject[]> {
  try {
    const projects = await connection.withStore<SavedImageProject[]>(
      IMAGE_STORE_NAME,
      "readonly",
      (store) =>
        (store.indexNames.contains("savedAt") ? store.index("savedAt") : store).getAll()
    );
    // Sort by savedAt descending (newest first)
    projects.sort(
      (a, b) => (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0)
    );
    return projects;
  } catch (error) {
    console.error("[IndexedDB] Failed to get image projects:", error);
    throw error;
  }
}

/**
 * Get a single image editor project by ID
 */
export async function getImageProject(id: string): Promise<SavedImageProject | undefined> {
  try {
    return await connection.withStore<SavedImageProject | undefined>(
      IMAGE_STORE_NAME,
      "readonly",
      (store) => store.get(id)
    );
  } catch (error) {
    console.error("[IndexedDB] Failed to get image project:", error);
    throw error;
  }
}

/**
 * Delete an image editor project by ID
 */
export async function deleteImageProject(id: string): Promise<void> {
  try {
    await connection.withStore(IMAGE_STORE_NAME, "readwrite", (store) =>
      store.delete(id)
    );
    console.log("[IndexedDB] Image project deleted:", id);
  } catch (error) {
    console.error("[IndexedDB] Failed to delete image project:", error);
    throw error;
  }
}
