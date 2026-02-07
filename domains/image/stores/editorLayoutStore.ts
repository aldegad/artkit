import { create } from "zustand";

// ============================================
// Types
// ============================================

interface FloatingWindow {
  id: string;
  panelId: string;
}

interface EditorLayoutStore {
  // State
  floatingWindows: FloatingWindow[];

  // Actions
  isPanelOpen: (panelId: string) => boolean;
  openFloatingWindow: (panelId: string) => void;
  closeFloatingWindow: (windowId: string) => void;
  closeFloatingWindowByPanelId: (panelId: string) => void;
  getFloatingWindowByPanelId: (panelId: string) => FloatingWindow | undefined;
}

// ============================================
// Store
// ============================================

export const useEditorLayoutStore = create<EditorLayoutStore>((set, get) => ({
  floatingWindows: [],

  isPanelOpen: (panelId) => {
    return get().floatingWindows.some((w) => w.panelId === panelId);
  },

  openFloatingWindow: (panelId) => {
    const existing = get().floatingWindows.find((w) => w.panelId === panelId);
    if (existing) return;

    set((state) => ({
      floatingWindows: [
        ...state.floatingWindows,
        { id: `window-${Date.now()}`, panelId },
      ],
    }));
  },

  closeFloatingWindow: (windowId) => {
    set((state) => ({
      floatingWindows: state.floatingWindows.filter((w) => w.id !== windowId),
    }));
  },

  closeFloatingWindowByPanelId: (panelId) => {
    set((state) => ({
      floatingWindows: state.floatingWindows.filter((w) => w.panelId !== panelId),
    }));
  },

  getFloatingWindowByPanelId: (panelId) => {
    return get().floatingWindows.find((w) => w.panelId === panelId);
  },
}));
