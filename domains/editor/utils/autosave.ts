// ============================================
// Image Editor Autosave Utilities (IndexedDB)
// ============================================

import { UnifiedLayer } from "../types";

export const EDITOR_AUTOSAVE_KEY = "editor-autosave";
export const EDITOR_AUTOSAVE_DEBOUNCE_MS = 1000;

const DB_NAME = "editor-autosave-db";
const DB_VERSION = 1;
const STORE_NAME = "autosave";

let dbInstance: IDBDatabase | null = null;

export interface EditorAutosaveData {
  id: string; // Always "current" for autosave
  canvasSize: { width: number; height: number };
  rotation: number;
  zoom: number;
  pan: { x: number; y: number };
  projectName: string;
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  brushSize: number;
  brushColor: string;
  brushHardness: number;
  savedAt: number;
}

/**
 * Open/create IndexedDB connection for autosave
 */
function openAutosaveDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("[Editor Autosave] Failed to open DB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
        console.log("[Editor Autosave] Created autosave store");
      }
    };
  });
}

/**
 * Load autosave data from IndexedDB
 */
export async function loadEditorAutosaveData(): Promise<EditorAutosaveData | null> {
  if (typeof window === "undefined") return null;

  try {
    const db = await openAutosaveDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(EDITOR_AUTOSAVE_KEY);

      request.onsuccess = () => {
        const data = request.result as EditorAutosaveData | undefined;
        if (data) {
          console.log("[Editor Autosave] Loaded saved data from", new Date(data.savedAt).toLocaleString());
          resolve(data);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error("[Editor Autosave] Failed to load:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("[Editor Autosave] Failed to load saved data:", error);
    return null;
  }
}

/**
 * Save autosave data to IndexedDB
 */
export async function saveEditorAutosaveData(data: Omit<EditorAutosaveData, "savedAt" | "id">): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const db = await openAutosaveDB();

    const dataWithMeta: EditorAutosaveData = {
      ...data,
      id: EDITOR_AUTOSAVE_KEY,
      savedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(dataWithMeta);

      request.onsuccess = () => {
        console.log("[Editor Autosave] Saved at", new Date().toLocaleTimeString());
        resolve();
      };

      request.onerror = () => {
        console.error("[Editor Autosave] Failed to save:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("[Editor Autosave] Failed to save:", error);
  }
}

/**
 * Clear autosave data from IndexedDB
 */
export async function clearEditorAutosaveData(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const db = await openAutosaveDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(EDITOR_AUTOSAVE_KEY);

      request.onsuccess = () => {
        console.log("[Editor Autosave] Cleared autosave data");
        resolve();
      };

      request.onerror = () => {
        console.error("[Editor Autosave] Failed to clear:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("[Editor Autosave] Failed to clear:", error);
  }
}
