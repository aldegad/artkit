"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { useTimeline, useVideoState } from "../../contexts";
import { useVideoCoordinates, useTimelineInput } from "../../hooks";
import { TimeRuler } from "./TimeRuler";
import { Track } from "./Track";
import { Playhead } from "./Playhead";
import { TimelineToolbar } from "./TimelineToolbar";
import { cn } from "@/shared/utils/cn";
import { DEFAULT_TRACK_HEIGHT } from "../../types";
import { TIMELINE } from "../../constants";

interface TimelineProps {
  className?: string;
}

export function Timeline({ className }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const {
    tracks,
    getClipsInTrack,
    viewState,
    setScrollX,
    setZoom,
    updateTrack,
    removeTrack,
    reorderTracks,
    saveToHistory,
  } = useTimeline();
  const { project } = useVideoState();
  useVideoCoordinates();

  // Timeline input handling (clip drag, trim, seek)
  const { handleMouseDown: handleTimelineMouseDown } = useTimelineInput(tracksContainerRef);

  // Middle-mouse scroll state
  const [isMiddleScrolling, setIsMiddleScrolling] = useState(false);
  const [trackHeaderWidth, setTrackHeaderWidth] = useState(180);
  const [isHeaderResizing, setIsHeaderResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, width: 180 });

  // Calculate total tracks height
  const totalTracksHeight = tracks.reduce((sum, t) => sum + t.height, 0);

  const headerWidthStyle = { width: trackHeaderWidth };
  const headerWidthPx = `${trackHeaderWidth}px`;

  const handleTrackDrop = useCallback((fromTrackId: string, toTrackId: string) => {
    if (!fromTrackId || !toTrackId || fromTrackId === toTrackId) return;
    const fromIndex = tracks.findIndex((track) => track.id === fromTrackId);
    const toIndex = tracks.findIndex((track) => track.id === toTrackId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    saveToHistory();
    reorderTracks(fromIndex, toIndex);
  }, [tracks, saveToHistory, reorderTracks]);

  const handleStartHeaderResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeStartRef.current = { x: e.clientX, width: trackHeaderWidth };
    setIsHeaderResizing(true);
  }, [trackHeaderWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("video-timeline-track-header-width");
    if (!stored) return;

    const parsed = Number(stored);
    if (Number.isFinite(parsed)) {
      setTrackHeaderWidth(Math.max(132, Math.min(360, parsed)));
    }
  }, []);

  useEffect(() => {
    if (!isHeaderResizing || typeof window === "undefined") return;

    const handleMove = (event: MouseEvent) => {
      const delta = event.clientX - resizeStartRef.current.x;
      const nextWidth = Math.max(132, Math.min(360, resizeStartRef.current.width + delta));
      setTrackHeaderWidth(nextWidth);
      window.localStorage.setItem("video-timeline-track-header-width", String(nextWidth));
    };

    const handleUp = () => {
      setIsHeaderResizing(false);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isHeaderResizing]);

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
      handleTimelineMouseDown(e);
    },
    [handleTimelineMouseDown]
  );

  // Refs for latest values to avoid stale closures in document event handlers
  const scrollStateRef = useRef({ scrollX: viewState.scrollX, zoom: viewState.zoom });
  scrollStateRef.current = { scrollX: viewState.scrollX, zoom: viewState.zoom };

  // Document-level events for middle-mouse scroll (smooth dragging outside timeline)
  useEffect(() => {
    if (!isMiddleScrolling) return;

    const onMouseMove = (e: MouseEvent) => {
      const { scrollX, zoom } = scrollStateRef.current;
      setScrollX(scrollX - e.movementX / zoom);
    };
    const onMouseUp = () => setIsMiddleScrolling(false);

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isMiddleScrolling, setScrollX]);

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
        data-video-timeline-root=""
        className="flex-1 overflow-hidden"
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
      >
        {/* Track headers + ruler row */}
        <div className="flex border-b border-border-default">
          {/* Track header column */}
          <div className="flex-shrink-0 bg-surface-secondary border-r border-border-default" style={headerWidthStyle}>
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
          <div className="flex-shrink-0 bg-surface-secondary border-r border-border-default overflow-y-auto" style={headerWidthStyle}>
            {tracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center px-2 border-b border-border-default"
                style={{ height: track.height }}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", track.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const fromTrackId = event.dataTransfer.getData("text/plain");
                  handleTrackDrop(fromTrackId, track.id);
                }}
              >
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {/* Visibility toggle */}
                  <button
                    onClick={() => updateTrack(track.id, { visible: !track.visible })}
                    className={cn(
                      "p-1 rounded hover:bg-surface-tertiary",
                      track.visible ? "text-text-primary" : "text-text-tertiary"
                    )}
                    title={track.visible ? "Hide track" : "Show track"}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      {track.visible ? (
                        <path d="M8 3C4.5 3 1.5 6 0 8c1.5 2 4.5 5 8 5s6.5-3 8-5c-1.5-2-4.5-5-8-5zm0 8a3 3 0 110-6 3 3 0 010 6z" />
                      ) : (
                        <path d="M2 2l12 12M8 4c2 0 4 1 5.5 2.5L12 8c-.5-1-1.5-2-4-2-1 0-2 .3-2.5.8L4 5.3C5 4.5 6.5 4 8 4zM3.5 6.5L5 8c.5 1 1.5 2 3 2 .5 0 1-.1 1.5-.3l1.5 1.5c-1 .5-2 .8-3 .8-3.5 0-6.5-3-8-5 .5-.7 1.2-1.5 2-2.2l1.5 1.7z" />
                      )}
                    </svg>
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
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      {track.muted ? (
                        <path d="M2 6h3l3-3v10l-3-3H2V6zm9.5-1L14 11.5l-1 1L10.5 6l1-1zm-1 6L13 8.5l1 1-2.5 2.5-1-1z" />
                      ) : (
                        <path d="M2 6h3l3-3v10l-3-3H2V6zm8.5 2a3.5 3.5 0 00-1.2-2.6l.9-.9A4.8 4.8 0 0111.8 8a4.8 4.8 0 01-1.6 3.5l-.9-.9A3.5 3.5 0 0010.5 8zm2.1 0c0-1.8-.7-3.4-1.9-4.6l.9-.9A7.1 7.1 0 0114.3 8a7.1 7.1 0 01-2.7 5.5l-.9-.9A5.8 5.8 0 0012.6 8z" />
                      )}
                    </svg>
                  </button>

                  {/* Track name */}
                  <span className="text-xs text-text-secondary truncate">
                    {track.name}
                  </span>

                  <button
                    onClick={() => {
                      saveToHistory();
                      removeTrack(track.id);
                    }}
                    className="p-1 rounded hover:bg-surface-tertiary text-text-tertiary hover:text-text-primary transition-colors"
                    title="Delete track"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3 4h10v1H3V4zm1 2h8v7H4V6zm2-3h4l1 1H5l1-1z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Track header/content resize handle */}
          <div
            className="w-1 shrink-0 cursor-ew-resize bg-border-default hover:bg-accent transition-colors"
            onMouseDown={handleStartHeaderResize}
            title="Resize track headers"
          />

          {/* Tracks content */}
          <div
            ref={tracksContainerRef}
            className="flex-1 overflow-auto relative"
            style={{ minWidth: `calc(100% - ${headerWidthPx})` }}
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
