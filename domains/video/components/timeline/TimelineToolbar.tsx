"use client";

import { useTimeline } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { AddVideoTrackIcon, AddAudioTrackIcon, SnapIcon, TimelineZoomOutIcon, TimelineZoomInIcon } from "@/shared/components/icons";
import Tooltip from "@/shared/components/Tooltip";
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
      <Tooltip content="Add Video/Image Track">
        <button
          onClick={() => addTrack(undefined, "video")}
          className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
        >
          <AddVideoTrackIcon />
        </button>
      </Tooltip>

      <Tooltip content="Add Audio Track">
        <button
          onClick={() => addTrack(undefined, "audio")}
          className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
        >
          <AddAudioTrackIcon />
        </button>
      </Tooltip>

      <div className="w-px h-4 bg-border" />

      {/* Snap toggle */}
      <Tooltip content={viewState.snapEnabled ? "Snap: ON — Clips snap to edges" : "Snap: OFF — Free positioning"}>
        <button
          onClick={toggleSnap}
          className={cn(
            "p-1.5 rounded transition-colors",
            viewState.snapEnabled
              ? "bg-accent/20 text-accent"
              : "hover:bg-surface-tertiary text-text-secondary"
          )}
        >
          <SnapIcon />
        </button>
      </Tooltip>

      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <Tooltip content="Zoom Out">
          <button
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
          >
            <TimelineZoomOutIcon />
          </button>
        </Tooltip>

        <span className="text-xs text-text-secondary min-w-[60px] text-center">
          {Math.round(viewState.zoom)}px/s
        </span>

        <Tooltip content="Zoom In">
          <button
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
          >
            <TimelineZoomInIcon />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
