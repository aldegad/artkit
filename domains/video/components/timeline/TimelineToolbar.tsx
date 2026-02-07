"use client";

import { useRef, useState, useEffect } from "react";
import { useTimeline } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { AddVideoTrackIcon, AddAudioTrackIcon, SnapIcon, SnapOffIcon, FilmStripIcon } from "@/shared/components/icons";
import Tooltip from "@/shared/components/Tooltip";
import { Popover } from "@/shared/components";
import { NumberScrubber } from "@/shared/components";
import { TIMELINE } from "../../constants";

interface TimelineToolbarProps {
  className?: string;
}

export function TimelineToolbar({ className }: TimelineToolbarProps) {
  const { viewState, setZoom, toggleSnap, addTrack } = useTimeline();

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < TIMELINE.TOOLBAR_COMPACT_BREAKPOINT);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={toolbarRef}
      className={cn(
        "flex items-center gap-2 px-2 py-1 bg-surface-secondary border-b border-border-default",
        className
      )}
    >
      {isCompact ? (
        <>
          {/* Compact mode: single button with popover */}
          <Popover
            trigger={
              <button className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors">
                <FilmStripIcon />
              </button>
            }
            align="start"
            side="bottom"
            closeOnScroll={false}
          >
            <div className="flex flex-col gap-0.5 p-1.5 min-w-[180px]">
              <button
                onClick={() => addTrack(undefined, "video")}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary text-text-secondary text-xs transition-colors"
              >
                <AddVideoTrackIcon className="w-4 h-4" />
                <span>Add Video Track</span>
              </button>
              <button
                onClick={() => addTrack(undefined, "audio")}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary text-text-secondary text-xs transition-colors"
              >
                <AddAudioTrackIcon className="w-4 h-4" />
                <span>Add Audio Track</span>
              </button>
              <div className="h-px bg-border-default my-1" />
              <button
                onClick={toggleSnap}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
                  viewState.snapEnabled
                    ? "bg-accent/20 text-accent"
                    : "hover:bg-surface-tertiary text-text-secondary"
                )}
              >
                {viewState.snapEnabled ? <SnapIcon className="w-4 h-4" /> : <SnapOffIcon className="w-4 h-4" />}
                <span>{viewState.snapEnabled ? "Snap: ON" : "Snap: OFF"}</span>
              </button>
            </div>
          </Popover>
        </>
      ) : (
        <>
          {/* Normal mode: all buttons visible */}
          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">Add Video/Image Track</span>
                <span className="text-text-tertiary text-[11px]">Add a new video or image track to the timeline</span>
              </div>
            }
          >
            <button
              onClick={() => addTrack(undefined, "video")}
              className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
            >
              <AddVideoTrackIcon />
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">Add Audio Track</span>
                <span className="text-text-tertiary text-[11px]">Add a new audio track to the timeline</span>
              </div>
            }
          >
            <button
              onClick={() => addTrack(undefined, "audio")}
              className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
            >
              <AddAudioTrackIcon />
            </button>
          </Tooltip>

          <div className="w-px h-4 bg-border-default" />

          {/* Snap toggle */}
          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{viewState.snapEnabled ? "Snap: ON" : "Snap: OFF"}</span>
                <span className="text-text-tertiary text-[11px]">
                  {viewState.snapEnabled ? "Clips snap to edges of other clips" : "Free positioning without snapping"}
                </span>
              </div>
            }
          >
            <button
              onClick={toggleSnap}
              className={cn(
                "p-1.5 rounded transition-colors",
                viewState.snapEnabled
                  ? "bg-accent/20 text-accent"
                  : "hover:bg-surface-tertiary text-text-secondary"
              )}
            >
              {viewState.snapEnabled ? <SnapIcon /> : <SnapOffIcon />}
            </button>
          </Tooltip>
        </>
      )}

      <div className="flex-1" />

      {/* Zoom controls - always visible */}
      <NumberScrubber
        value={viewState.zoom}
        onChange={setZoom}
        min={TIMELINE.MIN_ZOOM}
        max={TIMELINE.MAX_ZOOM}
        step={{ multiply: 1.5 }}
        format={(v) => `${Math.round(v)}px/s`}
        valueWidth="min-w-[60px]"
        size="sm"
        variant="zoom"
      />
    </div>
  );
}
