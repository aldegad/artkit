"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { useTimeline, useVideoState } from "../../contexts";
import { useVideoCoordinates, useTimelineInput } from "../../hooks";
import { TimeRuler } from "./TimeRuler";
import { Track } from "./Track";
import { Playhead } from "./Playhead";
import { TimelineToolbar } from "./TimelineToolbar";
import { cn } from "@/shared/utils/cn";
import { AddVideoTrackIcon, AddAudioTrackIcon, TrackVisibleIcon, TrackHiddenIcon, TrackMutedIcon, TrackUnmutedIcon } from "@/shared/components/icons";
import { DEFAULT_TRACK_HEIGHT } from "../../types";
import { TIMELINE } from "../../constants";

interface TimelineProps {
  className?: string;
}

export function Timeline({ className }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const { tracks, getClipsInTrack, viewState, setScrollX, setZoom, updateTrack, addTrack, removeTrack, reorderTracks, saveToHistory } = useTimeline();
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
  const [dragTrackId, setDragTrackId] = useState<string | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const [headerWidth, setHeaderWidth] = useState(136);
  const [isResizingHeader, setIsResizingHeader] = useState(false);

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

  useEffect(() => {
    if (!isResizingHeader) return;

    const onMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = Math.max(96, Math.min(260, event.clientX - rect.left));
      setHeaderWidth(next);
    };

    const onMouseUp = () => {
      setIsResizingHeader(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizingHeader]);

  // Handle wheel for horizontal scroll/zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = tracksContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const nextZoom = Math.max(
          TIMELINE.MIN_ZOOM,
          Math.min(TIMELINE.MAX_ZOOM, viewState.zoom * zoomFactor)
        );
        if (nextZoom === viewState.zoom) return;

        // Keep timeline time under cursor fixed while zooming.
        const cursorTime = viewState.scrollX + x / viewState.zoom;
        setZoom(nextZoom);
        setScrollX(Math.max(0, cursorTime - x / nextZoom));
      } else if (e.shiftKey) {
        // Horizontal scroll
        setScrollX(Math.max(0, viewState.scrollX + e.deltaY / viewState.zoom));
      }
    },
    [viewState.zoom, viewState.scrollX, setScrollX, setZoom]
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
          <div className="flex-shrink-0 bg-surface-secondary border-r border-border" style={{ width: headerWidth }}>
            <div className="h-6 px-1 flex items-center gap-1">
              <button
                onClick={() => addTrack(undefined, "video")}
                className="h-5 w-5 flex items-center justify-center rounded bg-surface-tertiary text-text-secondary hover:text-text-primary hover:bg-surface-tertiary/80 transition-colors"
                title="Add visual track (video/image)"
              >
                <AddVideoTrackIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => addTrack(undefined, "audio")}
                className="h-5 w-5 flex items-center justify-center rounded bg-surface-tertiary text-text-secondary hover:text-text-primary hover:bg-surface-tertiary/80 transition-colors"
                title="Add audio track"
              >
                <AddAudioTrackIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div
            className={cn(
              "w-1 cursor-col-resize bg-border/40 hover:bg-accent/60",
              isResizingHeader && "bg-accent"
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingHeader(true);
            }}
          />

          {/* Ruler */}
          <div className="flex-1 overflow-hidden">
            <TimeRuler />
          </div>
        </div>

        {/* Tracks area */}
        <div className="flex overflow-hidden" style={{ height: `calc(100% - 24px)` }}>
          {/* Track headers */}
          <div className="flex-shrink-0 bg-surface-secondary border-r border-border overflow-y-auto" style={{ width: headerWidth }}>
            {tracks.map((track) => (
              <div
                key={track.id}
                className={cn(
                  "flex items-center px-2 border-b border-border",
                  dragOverTrackId === track.id && "bg-surface-tertiary/60"
                )}
                style={{ height: track.height }}
                draggable
                onDragStart={(e) => {
                  setDragTrackId(track.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTrackId(track.id);
                }}
                onDragLeave={() => {
                  if (dragOverTrackId === track.id) {
                    setDragOverTrackId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!dragTrackId || dragTrackId === track.id) {
                    setDragOverTrackId(null);
                    return;
                  }

                  const fromIndex = tracks.findIndex((t) => t.id === dragTrackId);
                  const toIndex = tracks.findIndex((t) => t.id === track.id);
                  if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
                    saveToHistory();
                    reorderTracks(fromIndex, toIndex);
                  }
                  setDragTrackId(null);
                  setDragOverTrackId(null);
                }}
                onDragEnd={() => {
                  setDragTrackId(null);
                  setDragOverTrackId(null);
                }}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Visibility toggle */}
                  <button
                    onClick={() => updateTrack(track.id, { visible: !track.visible })}
                    className={cn(
                      "p-1 rounded hover:bg-surface-tertiary",
                      track.visible ? "text-text-primary" : "text-text-tertiary"
                    )}
                    title={track.visible ? "Hide track" : "Show track"}
                  >
                    {track.visible ? <TrackVisibleIcon /> : <TrackHiddenIcon />}
                  </button>

                  {/* Audio mute toggle */}
                  <button
                    onClick={() => updateTrack(track.id, { muted: !track.muted })}
                    className={cn(
                      "p-1 rounded hover:bg-surface-tertiary",
                      track.muted ? "text-text-tertiary" : "text-text-primary"
                    )}
                    title={track.muted ? "Unmute track" : "Mute track"}
                  >
                    {track.muted ? <TrackMutedIcon /> : <TrackUnmutedIcon />}
                  </button>

                  {/* Track name */}
                  <span className="text-xs text-text-secondary truncate">
                    {track.name}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tracks.length <= 1) return;
                      saveToHistory();
                      removeTrack(track.id);
                    }}
                    disabled={tracks.length <= 1}
                    className={cn(
                      "ml-auto p-1 rounded transition-colors",
                      tracks.length <= 1
                        ? "text-text-tertiary/40 cursor-not-allowed"
                        : "text-text-tertiary hover:text-red-400 hover:bg-surface-tertiary"
                    )}
                    title={tracks.length <= 1 ? "At least one track is required" : "Delete track"}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M5.5 2h5l.5 1H14v1H2V3h3l.5-1zm-1 3h1v8h-1V5zm3 0h1v8h-1V5zm3 0h1v8h-1V5z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div
            className={cn(
              "w-1 cursor-col-resize bg-border/40 hover:bg-accent/60",
              isResizingHeader && "bg-accent"
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingHeader(true);
            }}
          />

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
