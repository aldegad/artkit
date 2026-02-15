// ============================================
// Image Editor Autosave Utilities (IndexedDB)
// ============================================

import { createAutosave, type BaseAutosaveData } from "../../../shared/utils";
import { UnifiedLayer, Guide } from "../types";

export const EDITOR_AUTOSAVE_KEY = "image-editor-autosave";
export const EDITOR_AUTOSAVE_DEBOUNCE_MS = 1000;

export interface EditorAutosaveData extends BaseAutosaveData {
  // Project identity (optional for backward compatibility)
  currentProjectId?: string | null;
  projectGroup?: string;
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
  brushOpacity?: number; // Optional for backward compatibility
  guides?: Guide[]; // Optional for backward compatibility
  // UI state (optional for backward compatibility)
  showRulers?: boolean;
  showGuides?: boolean;
  lockGuides?: boolean;
  snapToGuides?: boolean;
  isPanLocked?: boolean;
}

// Create autosave storage using shared abstraction
const editorAutosave = createAutosave<EditorAutosaveData>({
  key: EDITOR_AUTOSAVE_KEY,
  dbName: "image-editor-autosave-db",
  storeName: "autosave",
  dbVersion: 1,
});

/**
 * Load autosave data from IndexedDB
 */
export async function loadEditorAutosaveData(): Promise<EditorAutosaveData | null> {
  return editorAutosave.load();
}

/**
 * Save autosave data to IndexedDB
 */
export async function saveEditorAutosaveData(
  data: Omit<EditorAutosaveData, "savedAt" | "id">
): Promise<void> {
  return editorAutosave.save(data);
}

/**
 * Clear autosave data from IndexedDB
 */
export async function clearEditorAutosaveData(): Promise<void> {
  return editorAutosave.clear();
}
