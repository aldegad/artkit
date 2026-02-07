"use client";

// ============================================
// Guide Tool Hook
// Manages guide state and interactions
// ============================================

import { useState, useCallback, useRef } from "react";
import type { Point } from "@/shared/types";
import type { Guide, GuideOrientation, GuideDragState } from "../types";
import { INITIAL_GUIDE_DRAG_STATE } from "../types";

// ============================================
// Types
// ============================================

export interface UseGuideToolOptions {
  getDisplayDimensions: () => { width: number; height: number };
  onGuidesChange?: (guides: Guide[]) => void;
}

export interface UseGuideToolReturn {
  // State
  guides: Guide[];
  setGuides: React.Dispatch<React.SetStateAction<Guide[]>>;
  dragState: GuideDragState;

  // Actions
  addGuide: (orientation: GuideOrientation, position: number) => string;
  removeGuide: (id: string) => void;
  moveGuide: (id: string, newPosition: number) => void;
  clearAllGuides: () => void;

  // Drag handlers
  startGuideDrag: (guideId: string, orientation: GuideOrientation, startPos: number) => void;
  startGuideCreate: (orientation: GuideOrientation, startPos: number) => void;
  updateGuideDrag: (currentPos: number) => void;
  endGuideDrag: () => Guide | null;
  cancelGuideDrag: () => void;

  // Utility
  getGuideAtPosition: (pos: Point, tolerance: number) => Guide | null;
  isPositionOnGuide: (
    pos: Point,
    guide: Guide,
    tolerance: number
  ) => boolean;
}

// ============================================
// Hook Implementation
// ============================================

export function useGuideTool(options: UseGuideToolOptions): UseGuideToolReturn {
  const { getDisplayDimensions, onGuidesChange } = options;

  // Guide state
  const [guides, setGuidesInternal] = useState<Guide[]>([]);
  const [dragState, setDragState] = useState<GuideDragState>(INITIAL_GUIDE_DRAG_STATE);

  // Track the guide being created during drag
  const creatingGuideRef = useRef<Guide | null>(null);

  // Wrapper to call onGuidesChange when guides change
  const setGuides: React.Dispatch<React.SetStateAction<Guide[]>> = useCallback(
    (action) => {
      setGuidesInternal((prev) => {
        const newGuides = typeof action === "function" ? action(prev) : action;
        onGuidesChange?.(newGuides);
        return newGuides;
      });
    },
    [onGuidesChange]
  );

  // ============================================
  // Guide Actions
  // ============================================

  const addGuide = useCallback(
    (orientation: GuideOrientation, position: number): string => {
      const id = crypto.randomUUID();
      const newGuide: Guide = { id, orientation, position: Math.round(position) };
      setGuides((prev) => [...prev, newGuide]);
      return id;
    },
    [setGuides]
  );

  const removeGuide = useCallback(
    (id: string) => {
      setGuides((prev) => prev.filter((g) => g.id !== id));
    },
    [setGuides]
  );

  const moveGuide = useCallback(
    (id: string, newPosition: number) => {
      setGuides((prev) =>
        prev.map((g) =>
          g.id === id ? { ...g, position: Math.round(newPosition) } : g
        )
      );
    },
    [setGuides]
  );

  const clearAllGuides = useCallback(() => {
    setGuides([]);
  }, [setGuides]);

  // ============================================
  // Drag Handlers
  // ============================================

  const startGuideDrag = useCallback(
    (guideId: string, orientation: GuideOrientation, startPos: number) => {
      setDragState({
        isActive: true,
        guideId,
        isCreating: false,
        orientation,
        startPosition: startPos,
        currentPosition: startPos,
      });
    },
    []
  );

  const startGuideCreate = useCallback(
    (orientation: GuideOrientation, startPos: number) => {
      // Create a temporary guide for preview
      const id = crypto.randomUUID();
      const newGuide: Guide = { id, orientation, position: Math.round(startPos) };
      creatingGuideRef.current = newGuide;

      setDragState({
        isActive: true,
        guideId: id,
        isCreating: true,
        orientation,
        startPosition: startPos,
        currentPosition: startPos,
      });
    },
    []
  );

  const updateGuideDrag = useCallback((currentPos: number) => {
    setDragState((prev) => ({
      ...prev,
      currentPosition: currentPos,
    }));

    // Update creating guide position for preview
    if (creatingGuideRef.current) {
      creatingGuideRef.current = {
        ...creatingGuideRef.current,
        position: Math.round(currentPos),
      };
    }
  }, []);

  const endGuideDrag = useCallback((): Guide | null => {
    const { isActive, guideId, isCreating, currentPosition, orientation } = dragState;

    if (!isActive || !guideId || !orientation) {
      setDragState(INITIAL_GUIDE_DRAG_STATE);
      creatingGuideRef.current = null;
      return null;
    }

    const { width, height } = getDisplayDimensions();
    const maxPosition = orientation === "horizontal" ? height : width;

    // Check if guide should be deleted (dragged outside canvas)
    const isOutsideCanvas =
      currentPosition < -10 || currentPosition > maxPosition + 10;

    let resultGuide: Guide | null = null;

    if (isCreating) {
      // Creating new guide
      if (!isOutsideCanvas && currentPosition >= 0 && currentPosition <= maxPosition) {
        const newGuide: Guide = {
          id: guideId,
          orientation,
          position: Math.round(currentPosition),
        };
        setGuides((prev) => [...prev, newGuide]);
        resultGuide = newGuide;
      }
    } else {
      // Moving existing guide
      if (isOutsideCanvas) {
        // Delete guide
        removeGuide(guideId);
      } else {
        // Update position
        moveGuide(guideId, currentPosition);
        resultGuide = { id: guideId, orientation, position: Math.round(currentPosition) };
      }
    }

    setDragState(INITIAL_GUIDE_DRAG_STATE);
    creatingGuideRef.current = null;
    return resultGuide;
  }, [dragState, getDisplayDimensions, setGuides, removeGuide, moveGuide]);

  const cancelGuideDrag = useCallback(() => {
    setDragState(INITIAL_GUIDE_DRAG_STATE);
    creatingGuideRef.current = null;
  }, []);

  // ============================================
  // Utility Functions
  // ============================================

  const isPositionOnGuide = useCallback(
    (pos: Point, guide: Guide, tolerance: number): boolean => {
      if (guide.orientation === "horizontal") {
        return Math.abs(pos.y - guide.position) <= tolerance;
      } else {
        return Math.abs(pos.x - guide.position) <= tolerance;
      }
    },
    []
  );

  const getGuideAtPosition = useCallback(
    (pos: Point, tolerance: number): Guide | null => {
      // Check guides in reverse order (last added = on top)
      for (let i = guides.length - 1; i >= 0; i--) {
        const guide = guides[i];
        if (isPositionOnGuide(pos, guide, tolerance)) {
          return guide;
        }
      }
      return null;
    },
    [guides, isPositionOnGuide]
  );

  return {
    guides,
    setGuides,
    dragState,
    addGuide,
    removeGuide,
    moveGuide,
    clearAllGuides,
    startGuideDrag,
    startGuideCreate,
    updateGuideDrag,
    endGuideDrag,
    cancelGuideDrag,
    getGuideAtPosition,
    isPositionOnGuide,
  };
}
