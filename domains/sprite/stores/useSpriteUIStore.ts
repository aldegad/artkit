import { create } from "zustand";
import { SavedSpriteProject, SpriteFrame } from "../types";
import { deepCopyFrame } from "../utils/frameUtils";

// ============================================
// Types
// ============================================

interface SpriteUIStore {
  // Windows
  isPreviewWindowOpen: boolean;
  isFrameEditOpen: boolean;
  isProjectListOpen: boolean;
  isSpriteSheetImportOpen: boolean;

  // Project
  projectName: string;
  savedProjects: SavedSpriteProject[];
  currentProjectId: string | null;

  // Clipboard
  clipboardFrame: SpriteFrame | null;

  // Actions - Windows
  setIsPreviewWindowOpen: (open: boolean) => void;
  setIsFrameEditOpen: (open: boolean) => void;
  setIsProjectListOpen: (open: boolean) => void;
  setIsSpriteSheetImportOpen: (open: boolean) => void;

  // Actions - Project
  setProjectName: (name: string) => void;
  setSavedSpriteProjects: (projects: SavedSpriteProject[] | ((prev: SavedSpriteProject[]) => SavedSpriteProject[])) => void;
  setCurrentProjectId: (id: string | null) => void;

  // Actions - Clipboard
  copyFrame: (frame: SpriteFrame) => void;
  getClipboardFrame: () => SpriteFrame | null;

  // Reset
  reset: () => void;
}

// ============================================
// Store
// ============================================

export const useSpriteUIStore = create<SpriteUIStore>((set, get) => ({
  // Initial State
  isPreviewWindowOpen: false,
  isFrameEditOpen: false,
  isProjectListOpen: false,
  isSpriteSheetImportOpen: false,
  projectName: "",
  savedProjects: [],
  currentProjectId: null,
  clipboardFrame: null,

  // Window Actions
  setIsPreviewWindowOpen: (open) => set({ isPreviewWindowOpen: open }),
  setIsFrameEditOpen: (open) => set({ isFrameEditOpen: open }),
  setIsProjectListOpen: (open) => set({ isProjectListOpen: open }),
  setIsSpriteSheetImportOpen: (open) => set({ isSpriteSheetImportOpen: open }),

  // Project Actions
  setProjectName: (name) => set({ projectName: name }),
  setSavedSpriteProjects: (projectsOrFn) =>
    set((state) => ({
      savedProjects: typeof projectsOrFn === "function" ? projectsOrFn(state.savedProjects) : projectsOrFn,
    })),
  setCurrentProjectId: (id) => set({ currentProjectId: id }),

  // Clipboard Actions
  copyFrame: (frame) => set({ clipboardFrame: deepCopyFrame(frame) }),
  getClipboardFrame: () => {
    const { clipboardFrame } = get();
    return clipboardFrame ? deepCopyFrame(clipboardFrame) : null;
  },

  // Reset
  reset: () =>
    set({
      isPreviewWindowOpen: false,
      isFrameEditOpen: false,
      isProjectListOpen: false,
      isSpriteSheetImportOpen: false,
      projectName: "",
      currentProjectId: null,
      // Note: savedProjects and clipboardFrame are not reset
    }),
}));
