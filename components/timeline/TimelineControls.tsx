"use client";

import { SpriteFrame, TimelineMode } from "../../types";
import { useLanguage } from "../../shared/contexts";

// ============================================
// Icon Components
// ============================================

const ReorderIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 9l4-4 4 4m0 6l-4 4-4-4"
    />
  </svg>
);

const OffsetIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 10l7-7m0 0l7 7m-7-7v18"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" />
  </svg>
);

const VideoIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

const MagnifyIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
    />
  </svg>
);

// ============================================
// Types
// ============================================

interface TimelineControlsProps {
  // Animation
  isPlaying: boolean;
  onTogglePlay: () => void;
  fps: number;
  onFpsChange: (fps: number) => void;

  // Frames
  frames: SpriteFrame[];
  currentFrameIndex: number;

  // Preview Canvas
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;

  // Timeline Mode
  timelineMode: TimelineMode;
  onTimelineModeChange: (mode: TimelineMode) => void;

  // Zoom
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;

  // Windows
  onOpenAnimationPreview: () => void;
  onOpenFramePreview: () => void;

  // Export
  onExportSpriteSheet: () => void;
}

// ============================================
// Component
// ============================================

export default function TimelineControls({
  isPlaying,
  onTogglePlay,
  fps,
  onFpsChange,
  frames,
  currentFrameIndex,
  previewCanvasRef,
  timelineMode,
  onTimelineModeChange,
  zoom,
  onZoomChange,
  onResetView,
  onOpenAnimationPreview,
  onOpenFramePreview,
  onExportSpriteSheet,
}: TimelineControlsProps) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle shrink-0 bg-surface-secondary/50">
      {/* Play/Pause */}
      <button onClick={onTogglePlay} disabled={frames.length === 0} className="btn btn-primary">
        {isPlaying ? `▶ ${t.play}` : `▶ ${t.play}`}
      </button>

      {/* FPS */}
      <div className="flex items-center gap-2 bg-surface-secondary rounded-full px-3 py-1.5">
        <span className="text-xs text-text-secondary font-medium">FPS:</span>
        <input
          type="range"
          min={1}
          max={60}
          value={fps}
          onChange={(e) => onFpsChange(parseInt(e.target.value))}
          className="w-20"
        />
        <span className="text-xs text-text-primary font-semibold w-6">{fps}</span>
      </div>

      <div className="divider" />

      {/* 미니 프리뷰 */}
      <div className="checkerboard w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden border border-border-default shadow-sm">
        {frames.length > 0 ? (
          <canvas ref={previewCanvasRef} className="max-w-full max-h-full" />
        ) : (
          <span className="text-text-tertiary text-xs">-</span>
        )}
      </div>

      <span className="text-sm text-text-secondary font-medium">
        {frames.length > 0 ? `${currentFrameIndex + 1} / ${frames.length}` : "-"}
      </span>

      <div className="divider" />

      {/* Timeline mode */}
      <div className="tool-group">
        <button
          onClick={() => onTimelineModeChange("reorder")}
          className={`tool-btn ${timelineMode === "reorder" ? "active" : ""}`}
          title={t.reorderMode}
        >
          <ReorderIcon />
          {t.reorder}
        </button>
        <button
          onClick={() => onTimelineModeChange("offset")}
          className={`tool-btn ${timelineMode === "offset" ? "active" : ""}`}
          title={t.offsetMode}
        >
          <OffsetIcon />
          {t.offset}
        </button>
      </div>

      <div className="flex-1" />

      {/* 줌 슬라이더 */}
      <div className="flex items-center gap-2 bg-surface-secondary rounded-full px-2 py-1">
        <button
          onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))}
          className="w-7 h-7 flex items-center justify-center hover:bg-interactive-hover rounded-full text-sm font-medium transition-colors"
        >
          −
        </button>
        <input
          type="range"
          min={10}
          max={300}
          value={Math.round(zoom * 100)}
          onChange={(e) => onZoomChange(parseInt(e.target.value) / 100)}
          className="w-20"
        />
        <button
          onClick={() => onZoomChange(Math.min(3, zoom + 0.1))}
          className="w-7 h-7 flex items-center justify-center hover:bg-interactive-hover rounded-full text-sm font-medium transition-colors"
        >
          +
        </button>
        <span className="text-xs text-text-secondary w-10 text-center font-medium">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={onResetView} className="btn btn-ghost text-xs px-2 py-1">
          Reset
        </button>
      </div>

      <div className="divider" />

      {/* Preview window buttons */}
      <button
        onClick={onOpenAnimationPreview}
        disabled={frames.length === 0}
        className="btn btn-primary"
      >
        <VideoIcon />
        {t.animation}
      </button>
      <button
        onClick={onOpenFramePreview}
        disabled={frames.length === 0}
        className="btn btn-secondary"
      >
        <MagnifyIcon />
        {t.frameWindow}
      </button>

      {frames.length > 0 && (
        <div className="relative group">
          <button onClick={onExportSpriteSheet} className="btn btn-primary">
            ↗ {t.export}
          </button>
        </div>
      )}
    </div>
  );
}
