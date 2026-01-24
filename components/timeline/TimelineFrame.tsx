"use client";

import { SpriteFrame, TimelineMode } from "../../types";

// ============================================
// Types
// ============================================

interface TimelineFrameProps {
  frame: SpriteFrame;
  index: number;
  isCurrentFrame: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  isEditingOffset: boolean;
  timelineMode: TimelineMode;

  // Event Handlers
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onOffsetMouseDown: (e: React.MouseEvent) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onDelete: () => void;
}

// ============================================
// Component
// ============================================

export default function TimelineFrame({
  frame,
  index,
  isCurrentFrame,
  isDragOver,
  isDragging,
  isEditingOffset,
  timelineMode,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onOffsetMouseDown,
  onClick,
  onDoubleClick,
  onDelete,
}: TimelineFrameProps) {
  const frameColor = `hsl(${(index * 60) % 360}, 70%, 50%)`;

  return (
    <div
      draggable={timelineMode === "reorder"}
      onDragStart={timelineMode === "reorder" ? onDragStart : undefined}
      onDragOver={timelineMode === "reorder" ? onDragOver : undefined}
      onDragLeave={timelineMode === "reorder" ? onDragLeave : undefined}
      onDrop={timelineMode === "reorder" ? onDrop : undefined}
      onDragEnd={timelineMode === "reorder" ? onDragEnd : undefined}
      onMouseDown={timelineMode === "offset" ? onOffsetMouseDown : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`
        frame-thumb shrink-0
        ${timelineMode === "reorder" ? "cursor-grab active:cursor-grabbing" : "cursor-move"}
        ${isCurrentFrame ? "selected" : ""}
        ${isDragOver ? "border-accent-primary! scale-105" : ""}
        ${isDragging ? "opacity-50" : ""}
        ${isEditingOffset ? "border-accent-warning!" : ""}
      `}
    >
      {/* 프레임 번호 */}
      <div
        className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold z-10 text-white shadow-md"
        style={{ backgroundColor: frameColor }}
      >
        {index + 1}
      </div>

      {/* 삭제 버튼 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute -top-2 -right-2 w-5 h-5 bg-accent-danger hover:bg-accent-danger-hover rounded-full flex items-center justify-center text-xs z-10 text-white transition-all hover:scale-110 shadow-sm"
      >
        ×
      </button>

      {/* 프레임 이미지 */}
      <div className="w-[120px] h-[100px] checkerboard rounded-lg overflow-hidden flex items-center justify-center">
        {frame.imageData ? (
          <img
            src={frame.imageData}
            alt={frame.name}
            className="max-w-full max-h-full object-contain pointer-events-none"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <span className="text-text-tertiary text-xs">No image</span>
        )}
      </div>

      {/* 프레임 이름 */}
      <div className="px-2 py-1.5 text-center bg-surface-secondary/50">
        <div className="text-xs text-text-primary font-medium truncate max-w-[120px]">
          {frame.name}
        </div>
        {timelineMode === "offset" && (
          <div className="text-[10px] text-text-tertiary font-mono">
            x:{frame.offset.x} y:{frame.offset.y}
          </div>
        )}
      </div>
    </div>
  );
}
