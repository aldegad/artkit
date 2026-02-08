import { SavedSpriteProject } from "@/domains/sprite/types";
import { SavedImageProject } from "@/domains/image/types";

// ============================================
// IndexedDB Storage for Sprite Editor
// ============================================

const DB_NAME = "sprite-editor-db";
const DB_VERSION = 2; // Bump version for new store
const STORE_NAME = "projects";
const IMAGE_STORE_NAME = "image-projects";

let dbInstance: IDBDatabase | null = null;

/**
 * Open/create IndexedDB connection
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("[IndexedDB] Failed to open:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create projects store (sprite editor)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt", { unique: false });
        store.createIndex("name", "name", { unique: false });
        console.log("[IndexedDB] Created projects store");
      }

      // Create image-projects store (image editor)
      if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        const store = db.createObjectStore(IMAGE_STORE_NAME, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt", { unique: false });
        store.createIndex("name", "name", { unique: false });
        console.log("[IndexedDB] Created image-projects store");
      }
    };
  });
}

/**
 * Save a project to IndexedDB
 */
export async function saveProject(project: SavedSpriteProject): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.put(project);

    request.onsuccess = () => {
      console.log("[IndexedDB] Project saved:", project.name);
      resolve();
    };

    request.onerror = () => {
      console.error("[IndexedDB] Failed to save project:", request.error);
      reject(request.error);
    };
  });
}

/**
 * Get all saved projects from IndexedDB
 */
export async function getAllProjects(): Promise<SavedSpriteProject[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("savedAt");

    // Get all, sorted by savedAt descending
    const request = index.getAll();

    request.onsuccess = () => {
      const projects = request.result as SavedSpriteProject[];
      // Sort by savedAt descending (newest first)
      projects.sort((a, b) => b.savedAt - a.savedAt);
      resolve(projects);
    };

    request.onerror = () => {
      console.error("[IndexedDB] Failed to get projects:", request.error);
      reject(request.error);
    };
  });
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string): Promise<SavedSpriteProject | undefined> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result as SavedSpriteProject | undefined);
    };

    request.onerror = () => {
      console.error("[IndexedDB] Failed to get project:", request.error);
      reject(request.error);
    };
  });
}

/**
 * Delete a project by ID
 */
export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.delete(id);

    request.onsuccess = () => {
      console.log("[IndexedDB] Project deleted:", id);
      resolve();
    };

    request.onerror = () => {
      console.error("[IndexedDB] Failed to delete project:", request.error);
      reject(request.error);
    };
  });
}

/**
 * Clear all projects
 */
export async function clearAllProjects(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.clear();

    request.onsuccess = () => {
      console.log("[IndexedDB] All projects cleared");
      resolve();
    };

    request.onerror = () => {
      console.error("[IndexedDB] Failed to clear projects:", request.error);
      reject(request.error);
    };
  });
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

/**
 * Migrate from localStorage to IndexedDB (one-time)
 */
export async function migrateFromLocalStorage(): Promise<number> {
  const STORAGE_KEY = "sprite-editor-projects";
  const stored = localStorage.getItem(STORAGE_KEY);

  if (!stored) return 0;

  try {
    const projects: SavedSpriteProject[] = JSON.parse(stored);

    for (const project of projects) {
      await saveProject(project);
    }

    // Clear localStorage after successful migration
    localStorage.removeItem(STORAGE_KEY);
    console.log(`[IndexedDB] Migrated ${projects.length} projects from localStorage`);

    return projects.length;
  } catch (error) {
    console.error("[IndexedDB] Migration failed:", error);
    return 0;
  }
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
  link.download = `sprite-editor-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(IMAGE_STORE_NAME);

    const request = store.put(project);

    request.onsuccess = () => {
      console.log("[IndexedDB] Image project saved:", project.name);
      resolve();
    };

    request.onerror = () => {
      console.error("[IndexedDB] Failed to save image project:", request.error);
      reject(request.error);
    };
  });
}

/**
 * Get all saved image editor projects from IndexedDB
 */
export async function getAllImageProjects(): Promise<SavedImageProject[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE_NAME, "readonly");
    const store = transaction.objectStore(IMAGE_STORE_NAME);
    const index = store.index("savedAt");

    const request = index.getAll();

    request.onsuccess = () => {
      const projects = request.result as SavedImageProject[];
      // Sort by savedAt descending (newest first)
      projects.sort((a, b) => b.savedAt - a.savedAt);
      resolve(projects);
    };

    request.onerror = () => {
      console.error("[IndexedDB] Failed to get image projects:", request.error);
      reject(request.error);
    };
  });
}

/**
 * Get a single image editor project by ID
 */
export async function getImageProject(id: string): Promise<SavedImageProject | undefined> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE_NAME, "readonly");
    const store = transaction.objectStore(IMAGE_STORE_NAME);

    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result as SavedImageProject | undefined);
    };

    request.onerror = () => {
      console.error("[IndexedDB] Failed to get image project:", request.error);
      reject(request.error);
    };
  });
}

/**
 * Delete an image editor project by ID
 */
export async function deleteImageProject(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(IMAGE_STORE_NAME);

    const request = store.delete(id);

    request.onsuccess = () => {
      console.log("[IndexedDB] Image project deleted:", id);
      resolve();
    };

    request.onerror = () => {
      console.error("[IndexedDB] Failed to delete image project:", request.error);
      reject(request.error);
    };
  });
}
