"use client";

import { CropArea } from "../../types";

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
    <div className="px-4 py-1.5 bg-surface-primary border-t border-border-default text-xs text-text-tertiary flex items-center gap-4">
      <span>
        Original: {canvasSize.width} × {canvasSize.height}
      </span>
      {rotation !== 0 && <span>Rotation: {rotation}°</span>}
      <span>Zoom: {Math.round(zoom * 100)}%</span>
      {cropArea && (
        <span className="text-accent-primary">
          Crop: {Math.round(cropArea.width)} × {Math.round(cropArea.height)} at (
          {Math.round(cropArea.x)}, {Math.round(cropArea.y)})
        </span>
      )}
      {selection && (
        <span className="text-accent-success">
          Selection: {Math.round(selection.width)} × {Math.round(selection.height)} at (
          {Math.round(selection.x)}, {Math.round(selection.y)})
        </span>
      )}
      <div className="flex-1" />
      <span className="text-text-quaternary">
        ⌘Z: 실행취소 | ⌘⇧Z: 다시실행 | M: 선택 | ⌘C/V: 복사/붙여넣기 | ⌥+드래그: 복제 | ⇧:
        수평/수직 고정
      </span>
    </div>
  );
}
