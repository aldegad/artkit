"use client";

import { useTimeline } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { TIMELINE } from "../../constants";

interface TimelineToolbarProps {
  className?: string;
}

export function TimelineToolbar({ className }: TimelineToolbarProps) {
  const { viewState, setZoom, toggleSnap, addTrack } = useTimeline();

  const handleZoomIn = () => {
    setZoom(Math.min(viewState.zoom * 1.5, TIMELINE.MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setZoom(Math.max(viewState.zoom / 1.5, TIMELINE.MIN_ZOOM));
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 bg-surface-secondary border-b border-border",
        className
      )}
    >
      {/* Add track */}
      <button
        onClick={() => addTrack()}
        className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
        title="Add Track"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2v12M2 8h12" />
        </svg>
      </button>

      <div className="w-px h-4 bg-border" />

      {/* Snap toggle */}
      <button
        onClick={toggleSnap}
        className={cn(
          "p-1.5 rounded transition-colors",
          viewState.snapEnabled
            ? "bg-accent/20 text-accent"
            : "hover:bg-surface-tertiary text-text-secondary"
        )}
        title={viewState.snapEnabled ? "Snap On" : "Snap Off"}
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2v12M12 2v12M2 8h12" />
        </svg>
      </button>

      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleZoomOut}
          className="p-1 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
          title="Zoom Out"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 8h10" />
          </svg>
        </button>

        <span className="text-xs text-text-secondary min-w-[60px] text-center">
          {Math.round(viewState.zoom)}px/s
        </span>

        <button
          onClick={handleZoomIn}
          className="p-1 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
          title="Zoom In"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
    </div>
  );
}
