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
  isVideoImportOpen: boolean;

  // Project
  projectName: string;
  savedProjects: SavedSpriteProject[];
  currentProjectId: string | null;

  // Clipboard
  clipboardFrame: SpriteFrame | null;

  // Video import
  pendingVideoFile: File | null;

  // Actions - Windows
  setIsPreviewWindowOpen: (open: boolean) => void;
  setIsFrameEditOpen: (open: boolean) => void;
  setIsProjectListOpen: (open: boolean) => void;
  setIsSpriteSheetImportOpen: (open: boolean) => void;
  setIsVideoImportOpen: (open: boolean) => void;

  // Actions - Project
  setProjectName: (name: string) => void;
  setSavedSpriteProjects: (projects: SavedSpriteProject[] | ((prev: SavedSpriteProject[]) => SavedSpriteProject[])) => void;
  setCurrentProjectId: (id: string | null) => void;

  // Actions - Clipboard
  copyFrame: (frame: SpriteFrame) => void;
  getClipboardFrame: () => SpriteFrame | null;

  // Actions - Video import
  setPendingVideoFile: (file: File | null) => void;

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
  isVideoImportOpen: false,
  projectName: "",
  savedProjects: [],
  currentProjectId: null,
  clipboardFrame: null,
  pendingVideoFile: null,

  // Window Actions
  setIsPreviewWindowOpen: (open) => set({ isPreviewWindowOpen: open }),
  setIsFrameEditOpen: (open) => set({ isFrameEditOpen: open }),
  setIsProjectListOpen: (open) => set({ isProjectListOpen: open }),
  setIsSpriteSheetImportOpen: (open) => set({ isSpriteSheetImportOpen: open }),
  setIsVideoImportOpen: (open) => set({ isVideoImportOpen: open }),

  // Project Actions
  setProjectName: (name) => set({ projectName: name }),
  setSavedSpriteProjects: (projectsOrFn) =>
    set((state) => ({
      savedProjects: typeof projectsOrFn === "function" ? projectsOrFn(state.savedProjects) : projectsOrFn,
    })),
  setCurrentProjectId: (id) => set({ currentProjectId: id }),

  // Video Import Actions
  setPendingVideoFile: (file) => set({ pendingVideoFile: file }),

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
      isVideoImportOpen: false,
      projectName: "",
      currentProjectId: null,
      pendingVideoFile: null,
      // Note: savedProjects and clipboardFrame are not reset
    }),
}));
