"use client";

import { CropArea } from "../../types";
import { Scrollbar } from "../../../../shared/components";

// ============================================
// Types
// ============================================

interface EditorStatusBarProps {
  canvasSize: { width: number; height: number };
  rotation: number;
  zoom: number;
  cropArea: CropArea | null;
  selection: CropArea | null;
}

// ============================================
// Component
// ============================================

export function EditorStatusBar({
  canvasSize,
  rotation,
  zoom,
  cropArea,
  selection,
}: EditorStatusBarProps) {
  return (
    <Scrollbar
      className="bg-surface-primary border-t border-border-default"
      overflow={{ x: "scroll", y: "hidden" }}
    >
      <div className="px-4 py-1.5 text-xs text-text-tertiary flex items-center gap-4 whitespace-nowrap">
        <span className="shrink-0">
          Original: {canvasSize.width} × {canvasSize.height}
        </span>
        {rotation !== 0 && <span className="shrink-0">Rotation: {rotation}°</span>}
        <span className="shrink-0">Zoom: {Math.round(zoom * 100)}%</span>
        {cropArea && (
          <span className="text-accent-primary shrink-0">
            Crop: {Math.round(cropArea.width)} × {Math.round(cropArea.height)} at (
            {Math.round(cropArea.x)}, {Math.round(cropArea.y)})
          </span>
        )}
        {selection && (
          <span className="text-accent-success shrink-0">
            Selection: {Math.round(selection.width)} × {Math.round(selection.height)} at (
            {Math.round(selection.x)}, {Math.round(selection.y)})
          </span>
        )}
        <div className="flex-1 min-w-0" />
        <span className="text-text-quaternary whitespace-nowrap shrink-0">
          ⌘Z/⇧Z: Undo/Redo | ⌘C/V: Copy/Paste | Space: Pan | Del: Clear | [ ]: Brush Size
        </span>
      </div>
    </Scrollbar>
  );
}
