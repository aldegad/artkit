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
        onClick={() => addTrack(undefined, "video")}
        className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
        title="Add Video Track"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2v12M2 8h12" />
        </svg>
      </button>

      <button
        onClick={() => addTrack(undefined, "audio")}
        className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
        title="Add Audio Track"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 6h3l3-3v10l-3-3H2V6zm8.5 2a3.5 3.5 0 00-1.2-2.6l.9-.9A4.8 4.8 0 0111.8 8a4.8 4.8 0 01-1.6 3.5l-.9-.9A3.5 3.5 0 0010.5 8zm2.1 0c0-1.8-.7-3.4-1.9-4.6l.9-.9A7.1 7.1 0 0114.3 8a7.1 7.1 0 01-2.7 5.5l-.9-.9A5.8 5.8 0 0012.6 8z" />
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
