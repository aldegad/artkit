"use client";

import { useTimeline } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { AddVideoTrackIcon, AddAudioTrackIcon, SnapIcon, TimelineZoomOutIcon, TimelineZoomInIcon } from "@/shared/components/icons";
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
        "flex items-center gap-2 px-2 py-1 bg-surface-secondary border-b border-border-default",
        className
      )}
    >
      {/* Add track */}
      <button
        onClick={() => addTrack(undefined, "video")}
        className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
        title="Add Visual Track (video/image)"
      >
        <AddVideoTrackIcon />
      </button>

      <button
        onClick={() => addTrack(undefined, "audio")}
        className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
        title="Add Audio Track"
      >
        <AddAudioTrackIcon />
      </button>

      <div className="w-px h-4 bg-border-default" />

      {/* Snap toggle */}
      <button
        onClick={toggleSnap}
        className={cn(
          "p-1.5 rounded transition-colors",
          viewState.snapEnabled
            ? "bg-accent/20 text-accent"
            : "hover:bg-surface-tertiary text-text-secondary"
        )}
        title={viewState.snapEnabled ? "Snap: ON - Clips snap to edges" : "Snap: OFF - Free positioning"}
      >
        <SnapIcon />
      </button>

      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleZoomOut}
          className="p-1 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
          title="Zoom Out"
        >
          <TimelineZoomOutIcon />
        </button>

        <span className="text-xs text-text-secondary min-w-[60px] text-center">
          {Math.round(viewState.zoom)}px/s
        </span>

        <button
          onClick={handleZoomIn}
          className="p-1 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
          title="Zoom In"
        >
          <TimelineZoomInIcon />
        </button>
      </div>
    </div>
  );
}
