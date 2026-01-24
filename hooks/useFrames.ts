import { useCallback } from "react";
import { Point, SpriteFrame, TimelineMode } from "../types";

interface UseFramesOptions {
  frames: SpriteFrame[];
  setFrames: React.Dispatch<React.SetStateAction<SpriteFrame[]>>;
  selectedFrameId: number | null;
  setSelectedFrameId: (id: number | null) => void;
  setSelectedPointIndex: (index: number | null) => void;
  draggedFrameId: number | null;
  setDraggedFrameId: (id: number | null) => void;
  dragOverIndex: number | null;
  setDragOverIndex: (index: number | null) => void;
  editingOffsetFrameId: number | null;
  setEditingOffsetFrameId: (id: number | null) => void;
  offsetDragStart: Point;
  setOffsetDragStart: (start: Point) => void;
  timelineMode: TimelineMode;
  setTimelineMode: (mode: TimelineMode) => void;
}

interface UseFramesReturn {
  // State
  frames: SpriteFrame[];
  draggedFrameId: number | null;
  dragOverIndex: number | null;
  editingOffsetFrameId: number | null;
  timelineMode: TimelineMode;

  // Frame CRUD
  addFrame: (frame: SpriteFrame) => void;
  updateFrame: (id: number, updates: Partial<SpriteFrame>) => void;
  deleteFrame: (id: number) => void;
  renameFrame: (id: number, name: string) => void;
  clearAllFrames: () => void;

  // Timeline Drag & Drop (reorder mode)
  handleTimelineDragStart: (e: React.DragEvent, frameId: number) => void;
  handleTimelineDragOver: (e: React.DragEvent, index: number) => void;
  handleTimelineDragLeave: () => void;
  handleTimelineDrop: (e: React.DragEvent, dropIndex: number) => void;
  handleTimelineDragEnd: () => void;
  reorderFrames: (fromIndex: number, toIndex: number) => void;

  // Offset Editing (offset mode)
  handleOffsetMouseDown: (e: React.MouseEvent, frameId: number) => void;
  handleOffsetMouseMove: (e: React.MouseEvent) => void;
  handleOffsetMouseUp: () => void;
  resetFrameOffset: (id: number) => void;

  // Mode
  setReorderMode: () => void;
  setOffsetMode: () => void;
}

/**
 * 프레임 관리 로직을 담당하는 훅
 */
export function useFrames({
  frames,
  setFrames,
  selectedFrameId,
  setSelectedFrameId,
  setSelectedPointIndex,
  draggedFrameId,
  setDraggedFrameId,
  dragOverIndex,
  setDragOverIndex,
  editingOffsetFrameId,
  setEditingOffsetFrameId,
  offsetDragStart,
  setOffsetDragStart,
  timelineMode,
  setTimelineMode,
}: UseFramesOptions): UseFramesReturn {
  // ============================================
  // Frame CRUD
  // ============================================

  const addFrame = useCallback(
    (frame: SpriteFrame) => {
      setFrames((prev) => [...prev, frame]);
    },
    [setFrames],
  );

  const updateFrame = useCallback(
    (id: number, updates: Partial<SpriteFrame>) => {
      setFrames((prev) =>
        prev.map((frame) => (frame.id === id ? { ...frame, ...updates } : frame)),
      );
    },
    [setFrames],
  );

  const deleteFrame = useCallback(
    (id: number) => {
      setFrames((prev) => prev.filter((f) => f.id !== id));
      if (selectedFrameId === id) {
        setSelectedFrameId(null);
        setSelectedPointIndex(null);
      }
    },
    [selectedFrameId, setFrames, setSelectedFrameId, setSelectedPointIndex],
  );

  const renameFrame = useCallback(
    (id: number, name: string) => {
      setFrames((prev) => prev.map((frame) => (frame.id === id ? { ...frame, name } : frame)));
    },
    [setFrames],
  );

  const clearAllFrames = useCallback(() => {
    setFrames([]);
    setSelectedFrameId(null);
    setSelectedPointIndex(null);
  }, [setFrames, setSelectedFrameId, setSelectedPointIndex]);

  // ============================================
  // Timeline Drag & Drop (Reorder Mode)
  // ============================================

  const handleTimelineDragStart = useCallback(
    (e: React.DragEvent, frameId: number) => {
      setDraggedFrameId(frameId);
      e.dataTransfer.effectAllowed = "move";
    },
    [setDraggedFrameId],
  );

  const handleTimelineDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDragOverIndex(index);
    },
    [setDragOverIndex],
  );

  const handleTimelineDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, [setDragOverIndex]);

  const handleTimelineDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      if (draggedFrameId === null) return;

      const dragIndex = frames.findIndex((f) => f.id === draggedFrameId);
      if (dragIndex === -1 || dragIndex === dropIndex) {
        setDraggedFrameId(null);
        setDragOverIndex(null);
        return;
      }

      const newFrames = [...frames];
      const [draggedFrame] = newFrames.splice(dragIndex, 1);
      newFrames.splice(dropIndex, 0, draggedFrame);

      setFrames(newFrames);
      setDraggedFrameId(null);
      setDragOverIndex(null);
    },
    [draggedFrameId, frames, setFrames, setDraggedFrameId, setDragOverIndex],
  );

  const handleTimelineDragEnd = useCallback(() => {
    setDraggedFrameId(null);
    setDragOverIndex(null);
  }, [setDraggedFrameId, setDragOverIndex]);

  const reorderFrames = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= frames.length) return;
      if (toIndex < 0 || toIndex >= frames.length) return;

      const newFrames = [...frames];
      const [movedFrame] = newFrames.splice(fromIndex, 1);
      newFrames.splice(toIndex, 0, movedFrame);
      setFrames(newFrames);
    },
    [frames, setFrames],
  );

  // ============================================
  // Offset Editing (Offset Mode)
  // ============================================

  const handleOffsetMouseDown = useCallback(
    (e: React.MouseEvent, frameId: number) => {
      e.stopPropagation();
      setEditingOffsetFrameId(frameId);
      setOffsetDragStart({ x: e.clientX, y: e.clientY });
    },
    [setEditingOffsetFrameId, setOffsetDragStart],
  );

  const handleOffsetMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (editingOffsetFrameId === null) return;

      const dx = e.clientX - offsetDragStart.x;
      const dy = e.clientY - offsetDragStart.y;

      setFrames((prev) =>
        prev.map((frame) =>
          frame.id === editingOffsetFrameId
            ? { ...frame, offset: { x: frame.offset.x + dx, y: frame.offset.y + dy } }
            : frame,
        ),
      );
      setOffsetDragStart({ x: e.clientX, y: e.clientY });
    },
    [editingOffsetFrameId, offsetDragStart, setFrames, setOffsetDragStart],
  );

  const handleOffsetMouseUp = useCallback(() => {
    setEditingOffsetFrameId(null);
  }, [setEditingOffsetFrameId]);

  const resetFrameOffset = useCallback(
    (id: number) => {
      setFrames((prev) =>
        prev.map((frame) => (frame.id === id ? { ...frame, offset: { x: 0, y: 0 } } : frame)),
      );
    },
    [setFrames],
  );

  // ============================================
  // Mode
  // ============================================

  const setReorderMode = useCallback(() => {
    setTimelineMode("reorder");
  }, [setTimelineMode]);

  const setOffsetMode = useCallback(() => {
    setTimelineMode("offset");
  }, [setTimelineMode]);

  return {
    // State
    frames,
    draggedFrameId,
    dragOverIndex,
    editingOffsetFrameId,
    timelineMode,

    // Frame CRUD
    addFrame,
    updateFrame,
    deleteFrame,
    renameFrame,
    clearAllFrames,

    // Timeline Drag & Drop
    handleTimelineDragStart,
    handleTimelineDragOver,
    handleTimelineDragLeave,
    handleTimelineDrop,
    handleTimelineDragEnd,
    reorderFrames,

    // Offset Editing
    handleOffsetMouseDown,
    handleOffsetMouseMove,
    handleOffsetMouseUp,
    resetFrameOffset,

    // Mode
    setReorderMode,
    setOffsetMode,
  };
}
