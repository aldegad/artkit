import { SavedVideoProject } from "@/domains/video/types/project";

// ============================================
// IndexedDB Storage for Video Editor
// ============================================

const DB_NAME = "video-projects-db";
const DB_VERSION = 1;
const STORE_NAME = "video-projects";

let dbInstance: IDBDatabase | null = null;

/**
 * Open/create IndexedDB connection
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("[VideoStorage] Failed to open:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt", { unique: false });
        store.createIndex("name", "name", { unique: false });
      }
    };
  });
}

/**
 * Save a video project to IndexedDB
 */
export async function saveVideoProject(project: SavedVideoProject): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(project);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all saved video projects from IndexedDB
 */
export async function getAllVideoProjects(): Promise<SavedVideoProject[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("savedAt");
    const request = index.getAll();

    request.onsuccess = () => {
      const projects = request.result as SavedVideoProject[];
      projects.sort((a, b) => b.savedAt - a.savedAt);
      resolve(projects);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a single video project by ID
 */
export async function getVideoProject(id: string): Promise<SavedVideoProject | undefined> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as SavedVideoProject | undefined);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a video project by ID
 */
export async function deleteVideoProject(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
