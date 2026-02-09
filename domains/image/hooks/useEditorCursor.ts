"use client";

import { useCallback } from "react";
import { CropArea, Point, Guide, EditorToolMode } from "../types";

interface UseEditorCursorOptions {
  hoveredGuide: Guide | null;
  showGuides: boolean;
  lockGuides: boolean;
  getActiveToolMode: () => EditorToolMode;
  isDragging: boolean;
  isMovingSelection: boolean;
  isDuplicating: boolean;
  selection: CropArea | null;
  isAltPressed: boolean;
  mousePos: Point | null;
}

interface UseEditorCursorReturn {
  getCursor: () => string;
}

export function useEditorCursor(options: UseEditorCursorOptions): UseEditorCursorReturn {
  const {
    hoveredGuide,
    showGuides,
    lockGuides,
    getActiveToolMode,
    isDragging,
    isMovingSelection,
    isDuplicating,
    selection,
    isAltPressed,
    mousePos,
  } = options;

  const getCursor = useCallback((): string => {
    if (hoveredGuide && showGuides && !lockGuides) {
      return hoveredGuide.orientation === "horizontal" ? "ns-resize" : "ew-resize";
    }

    const activeMode = getActiveToolMode();
    if (activeMode === "hand") return isDragging ? "grabbing" : "grab";
    if (activeMode === "zoom") return "zoom-in";
    if (activeMode === "eyedropper") return "crosshair";
    if (activeMode === "fill") return "crosshair";

    if (activeMode === "brush" || activeMode === "eraser" || activeMode === "stamp") {
      return mousePos ? "none" : "crosshair";
    }

    if (activeMode === "marquee") {
      if (isDragging && isMovingSelection) {
        return isDuplicating ? "copy" : "move";
      }
      if (selection && isAltPressed && mousePos) {
        if (
          mousePos.x >= selection.x &&
          mousePos.x <= selection.x + selection.width &&
          mousePos.y >= selection.y &&
          mousePos.y <= selection.y + selection.height
        ) {
          return "copy";
        }
      }
      return "crosshair";
    }

    return "crosshair";
  }, [
    hoveredGuide,
    showGuides,
    lockGuides,
    getActiveToolMode,
    isDragging,
    isMovingSelection,
    isDuplicating,
    selection,
    isAltPressed,
    mousePos,
  ]);

  return {
    getCursor,
  };
}
