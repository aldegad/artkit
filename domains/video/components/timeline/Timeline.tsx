"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { useTimeline, useVideoState, useMask } from "../../contexts";
import { useVideoCoordinates, useTimelineInput } from "../../hooks";
import { TimeRuler } from "./TimeRuler";
import { Track } from "./Track";
import { Playhead } from "./Playhead";
import { TimelineToolbar } from "./TimelineToolbar";
import { cn } from "@/shared/utils/cn";
import { TrackVisibleIcon, TrackHiddenIcon, TrackUnmutedIcon, TrackMutedIcon, DeleteIcon } from "@/shared/components/icons";
import { DEFAULT_TRACK_HEIGHT } from "../../types";
import { TIMELINE } from "../../constants";

interface TimelineProps {
  className?: string;
}

export function Timeline({ className }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const trackHeadersRef = useRef<HTMLDivElement>(null);
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
  const { getMasksForTrack } = useMask();
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

  // Sync vertical scroll from clips area to track headers
  useEffect(() => {
    const tracksEl = tracksContainerRef.current;
    const headersEl = trackHeadersRef.current;
    if (!tracksEl || !headersEl) return;

    const onScroll = () => {
      headersEl.scrollTop = tracksEl.scrollTop;
    };

    tracksEl.addEventListener("scroll", onScroll, { passive: true });
    return () => tracksEl.removeEventListener("scroll", onScroll);
  }, []);

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
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Horizontal scroll (shift+wheel or trackpad horizontal swipe)
        e.preventDefault();
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        setScrollX(Math.max(0, viewState.scrollX + delta / viewState.zoom));
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
          <div ref={trackHeadersRef} className="flex-shrink-0 bg-surface-secondary border-r border-border-default overflow-y-hidden" style={headerWidthStyle}>
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
                    {track.visible ? (
                      <TrackVisibleIcon className="w-3 h-3" />
                    ) : (
                      <TrackHiddenIcon className="w-3 h-3" />
                    )}
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
                    {track.muted ? (
                      <TrackMutedIcon className="w-3 h-3" />
                    ) : (
                      <TrackUnmutedIcon className="w-3 h-3" />
                    )}
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
                    <DeleteIcon className="w-3 h-3" />
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
                  masks={getMasksForTrack(track.id)}
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
