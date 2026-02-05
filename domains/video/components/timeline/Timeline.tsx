"use client";

import { useRef, useCallback, useState } from "react";
import { useTimeline, useVideoState } from "../../contexts";
import { useVideoCoordinates, useTimelineInput } from "../../hooks";
import { TimeRuler } from "./TimeRuler";
import { Track } from "./Track";
import { Playhead } from "./Playhead";
import { TimelineToolbar } from "./TimelineToolbar";
import { cn } from "@/shared/utils/cn";
import { DEFAULT_TRACK_HEIGHT } from "../../types";

interface TimelineProps {
  className?: string;
}

export function Timeline({ className }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const { tracks, getClipsInTrack, viewState, setScrollX } = useTimeline();
  const { project } = useVideoState();
  useVideoCoordinates();

  // Timeline input handling (clip drag, trim, seek)
  const {
    handleMouseDown: handleTimelineMouseDown,
    handleMouseMove: handleTimelineMouseMove,
    handleMouseUp: handleTimelineMouseUp,
  } = useTimelineInput();

  // Middle-mouse scroll state
  const [isMiddleScrolling, setIsMiddleScrolling] = useState(false);

  // Calculate total tracks height
  const totalTracksHeight = tracks.reduce((sum, t) => sum + t.height, 0);

  // Handle mouse down - combine timeline input with middle-mouse scroll
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Middle mouse button for scrolling
      if (e.button === 1) {
        e.preventDefault();
        setIsMiddleScrolling(true);
        return;
      }

      // Left click - use timeline input handler
      const rect = tracksContainerRef.current?.getBoundingClientRect();
      if (rect) {
        handleTimelineMouseDown(e, rect);
      }
    },
    [handleTimelineMouseDown]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Middle-mouse scroll
      if (isMiddleScrolling) {
        setScrollX(viewState.scrollX - e.movementX / viewState.zoom);
        return;
      }

      // Timeline input (clip drag, trim, seek)
      const rect = tracksContainerRef.current?.getBoundingClientRect();
      if (rect) {
        handleTimelineMouseMove(e, rect);
      }
    },
    [isMiddleScrolling, viewState.scrollX, viewState.zoom, setScrollX, handleTimelineMouseMove]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsMiddleScrolling(false);
    handleTimelineMouseUp();
  }, [handleTimelineMouseUp]);

  // Handle wheel for horizontal scroll/zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom - TODO: implement zoom toward cursor position
        e.preventDefault();
      } else if (e.shiftKey) {
        // Horizontal scroll
        setScrollX(Math.max(0, viewState.scrollX + e.deltaY / viewState.zoom));
      }
    },
    [viewState.zoom, viewState.scrollX, setScrollX]
  );

  return (
    <div className={cn("flex flex-col h-full bg-surface-primary", className)}>
      {/* Toolbar */}
      <TimelineToolbar />

      {/* Timeline container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Track headers + ruler row */}
        <div className="flex border-b border-border">
          {/* Track header column */}
          <div className="w-32 flex-shrink-0 bg-surface-secondary border-r border-border">
            <div className="h-6" /> {/* Ruler spacer */}
          </div>

          {/* Ruler */}
          <div className="flex-1 overflow-hidden">
            <TimeRuler />
          </div>
        </div>

        {/* Tracks area */}
        <div className="flex overflow-hidden" style={{ height: `calc(100% - 24px)` }}>
          {/* Track headers */}
          <div className="w-32 flex-shrink-0 bg-surface-secondary border-r border-border overflow-y-auto">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center px-2 border-b border-border"
                style={{ height: track.height }}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Visibility toggle */}
                  <button
                    className={cn(
                      "p-1 rounded hover:bg-surface-tertiary",
                      track.visible ? "text-text-primary" : "text-text-tertiary"
                    )}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      {track.visible ? (
                        <path d="M8 3C4.5 3 1.5 6 0 8c1.5 2 4.5 5 8 5s6.5-3 8-5c-1.5-2-4.5-5-8-5zm0 8a3 3 0 110-6 3 3 0 010 6z" />
                      ) : (
                        <path d="M2 2l12 12M8 4c2 0 4 1 5.5 2.5L12 8c-.5-1-1.5-2-4-2-1 0-2 .3-2.5.8L4 5.3C5 4.5 6.5 4 8 4zM3.5 6.5L5 8c.5 1 1.5 2 3 2 .5 0 1-.1 1.5-.3l1.5 1.5c-1 .5-2 .8-3 .8-3.5 0-6.5-3-8-5 .5-.7 1.2-1.5 2-2.2l1.5 1.7z" />
                      )}
                    </svg>
                  </button>

                  {/* Track name */}
                  <span className="text-xs text-text-secondary truncate">
                    {track.name}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Tracks content */}
          <div
            ref={tracksContainerRef}
            className="flex-1 overflow-auto relative"
          >
            {/* Background for click handling */}
            <div
              className="timeline-bg absolute inset-0"
              style={{ minWidth: project.duration * viewState.zoom }}
            />

            {/* Tracks */}
            <div className="relative" style={{ minWidth: project.duration * viewState.zoom }}>
              {tracks.map((track) => (
                <Track
                  key={track.id}
                  track={track}
                  clips={getClipsInTrack(track.id)}
                />
              ))}

              {/* Playhead */}
              <Playhead height={totalTracksHeight || DEFAULT_TRACK_HEIGHT} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
