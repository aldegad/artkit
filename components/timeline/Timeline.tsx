"use client";

import { SpriteFrame, TimelineMode } from "../../types";
import { Scrollbar } from "../../shared/components";
import TimelineControls from "./TimelineControls";
import TimelineFrame from "./TimelineFrame";

// ============================================
// Types
// ============================================

interface TimelineProps {
  // Animation
  isPlaying: boolean;
  onTogglePlay: () => void;
  fps: number;
  onFpsChange: (fps: number) => void;

  // Frames
  frames: SpriteFrame[];
  currentFrameIndex: number;
  onFrameSelect: (index: number, frameId: number) => void;
  onFrameDelete: (frameId: number) => void;
  onOpenFramePreview: (index: number) => void;

  // Preview Canvas
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;

  // Timeline Mode
  timelineMode: TimelineMode;
  onTimelineModeChange: (mode: TimelineMode) => void;

  // Drag & Drop
  draggedFrameId: number | null;
  dragOverIndex: number | null;
  onDragStart: (e: React.DragEvent, frameId: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;

  // Offset Editing
  editingOffsetFrameId: number | null;
  onOffsetMouseDown: (e: React.MouseEvent, frameId: number) => void;

  // Zoom
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;

  // Windows
  onOpenAnimationPreview: () => void;

  // Export
  onExportSpriteSheet: () => void;
}

// ============================================
// Component
// ============================================

export default function Timeline({
  isPlaying,
  onTogglePlay,
  fps,
  onFpsChange,
  frames,
  currentFrameIndex,
  onFrameSelect,
  onFrameDelete,
  onOpenFramePreview,
  previewCanvasRef,
  timelineMode,
  onTimelineModeChange,
  draggedFrameId,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  editingOffsetFrameId,
  onOffsetMouseDown,
  zoom,
  onZoomChange,
  onResetView,
  onOpenAnimationPreview,
  onExportSpriteSheet,
}: TimelineProps) {
  return (
    <div className="flex-1 flex flex-col bg-surface-primary min-h-0 timeline-bar">
      {/* 컨트롤 바 */}
      <TimelineControls
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        fps={fps}
        onFpsChange={onFpsChange}
        frames={frames}
        currentFrameIndex={currentFrameIndex}
        previewCanvasRef={previewCanvasRef}
        timelineMode={timelineMode}
        onTimelineModeChange={onTimelineModeChange}
        zoom={zoom}
        onZoomChange={onZoomChange}
        onResetView={onResetView}
        onOpenAnimationPreview={onOpenAnimationPreview}
        onOpenFramePreview={() => onOpenFramePreview(currentFrameIndex)}
        onExportSpriteSheet={onExportSpriteSheet}
      />

      {/* 프레임 타임라인 */}
      <Scrollbar className="flex-1 p-3">
        <div className="flex items-start gap-3 min-h-full">
          {frames.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm h-32">
              이미지에서 폴리곤을 그려 프레임을 추가하세요
            </div>
          ) : (
            frames.map((frame, idx) => (
              <TimelineFrame
                key={frame.id}
                frame={frame}
                index={idx}
                isCurrentFrame={idx === currentFrameIndex}
                isDragOver={dragOverIndex === idx}
                isDragging={draggedFrameId === frame.id}
                isEditingOffset={editingOffsetFrameId === frame.id}
                timelineMode={timelineMode}
                onDragStart={(e) => onDragStart(e, frame.id)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, idx)}
                onDragEnd={onDragEnd}
                onOffsetMouseDown={(e) => onOffsetMouseDown(e, frame.id)}
                onClick={() => onFrameSelect(idx, frame.id)}
                onDoubleClick={() => onOpenFramePreview(idx)}
                onDelete={() => onFrameDelete(frame.id)}
              />
            ))
          )}
        </div>
      </Scrollbar>
    </div>
  );
}
