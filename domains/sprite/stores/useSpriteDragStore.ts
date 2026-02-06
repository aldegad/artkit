import { create } from "zustand";
import { Point } from "../types";

// ============================================
// Types
// ============================================

interface SpriteDragStore {
  // Drag State
  isDragging: boolean;
  dragStart: Point;
  isPanning: boolean;
  lastPanPoint: Point;

  // Frame Drag
  draggedFrameId: number | null;
  dragOverIndex: number | null;

  // Track Drag
  draggedTrackId: string | null;
  dragOverTrackIndex: number | null;

  // Offset Drag
  editingOffsetFrameId: number | null;
  offsetDragStart: Point;

  // Resize
  isResizing: boolean;

  // Actions
  setIsDragging: (dragging: boolean) => void;
  setDragStart: (start: Point) => void;
  setIsPanning: (panning: boolean) => void;
  setLastPanPoint: (point: Point) => void;
  setDraggedFrameId: (id: number | null) => void;
  setDragOverIndex: (index: number | null) => void;
  setDraggedTrackId: (id: string | null) => void;
  setDragOverTrackIndex: (index: number | null) => void;
  setEditingOffsetFrameId: (id: number | null) => void;
  setOffsetDragStart: (start: Point) => void;
  setIsResizing: (resizing: boolean) => void;

  // Reset
  reset: () => void;
}

// ============================================
// Store
// ============================================

export const useSpriteDragStore = create<SpriteDragStore>((set) => ({
  // Initial State
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  isPanning: false,
  lastPanPoint: { x: 0, y: 0 },
  draggedFrameId: null,
  dragOverIndex: null,
  draggedTrackId: null,
  dragOverTrackIndex: null,
  editingOffsetFrameId: null,
  offsetDragStart: { x: 0, y: 0 },
  isResizing: false,

  // Actions
  setIsDragging: (dragging) => set({ isDragging: dragging }),
  setDragStart: (start) => set({ dragStart: start }),
  setIsPanning: (panning) => set({ isPanning: panning }),
  setLastPanPoint: (point) => set({ lastPanPoint: point }),
  setDraggedFrameId: (id) => set({ draggedFrameId: id }),
  setDragOverIndex: (index) => set({ dragOverIndex: index }),
  setDraggedTrackId: (id) => set({ draggedTrackId: id }),
  setDragOverTrackIndex: (index) => set({ dragOverTrackIndex: index }),
  setEditingOffsetFrameId: (id) => set({ editingOffsetFrameId: id }),
  setOffsetDragStart: (start) => set({ offsetDragStart: start }),
  setIsResizing: (resizing) => set({ isResizing: resizing }),

  // Reset
  reset: () =>
    set({
      isDragging: false,
      dragStart: { x: 0, y: 0 },
      isPanning: false,
      lastPanPoint: { x: 0, y: 0 },
      draggedFrameId: null,
      dragOverIndex: null,
      draggedTrackId: null,
      dragOverTrackIndex: null,
      editingOffsetFrameId: null,
      offsetDragStart: { x: 0, y: 0 },
      isResizing: false,
    }),
}));
