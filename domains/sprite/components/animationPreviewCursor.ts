import type { SpriteToolMode } from "../types";

interface ResolveAnimationPreviewCursorOptions {
  isAiSelecting: boolean;
  isHandMode: boolean;
  isPanDragging: boolean;
  isZoomTool: boolean;
  isEyedropperTool: boolean;
  isMagicWandTool: boolean;
  toolMode: SpriteToolMode;
  isDraggingCrop: boolean;
  cropDragMode: string | null;
  cropCursor: string;
}

export function resolveAnimationPreviewCursor({
  isAiSelecting,
  isHandMode,
  isPanDragging,
  isZoomTool,
  isEyedropperTool,
  isMagicWandTool,
  toolMode,
  isDraggingCrop,
  cropDragMode,
  cropCursor,
}: ResolveAnimationPreviewCursorOptions): string {
  if (isAiSelecting) {
    return "progress";
  }
  if (isHandMode) {
    return isPanDragging ? "grabbing" : "grab";
  }
  if (isZoomTool) {
    return "zoom-in";
  }
  if (isEyedropperTool || isMagicWandTool) {
    return "crosshair";
  }
  if (toolMode === "crop") {
    if (!isDraggingCrop) return cropCursor;
    return cropDragMode === "move" ? "grabbing" : cropCursor;
  }
  return "default";
}
