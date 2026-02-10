"use client";

import { useRef, useCallback, useEffect } from "react";
import { useTimeline, useVideoState, useMask } from "../../contexts";
import { useTimelineInput, useTimelineLayoutInput, useVideoCoordinates } from "../../hooks";
import { TimeRuler } from "./TimeRuler";
import { Track } from "./Track";
import { Playhead } from "./Playhead";
import { TimelineToolbar } from "./TimelineToolbar";
import { PreRenderBar } from "./PreRenderBar";
import { cn } from "@/shared/utils/cn";
import { EyeOpenIcon, EyeClosedIcon, TrackUnmutedIcon, TrackMutedIcon, DeleteIcon, MenuIcon, ChevronDownIcon, DuplicateIcon } from "@/shared/components/icons";
import { Popover } from "@/shared/components/Popover";
import { DEFAULT_TRACK_HEIGHT } from "../../types";
import { MASK_LANE_HEIGHT, TIMELINE } from "../../constants";

interface TimelineProps {
  className?: string;
}

export function Timeline({ className }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const {
    tracks,
    clips: allClips,
    getClipsInTrack,
    viewState,
    updateTrack,
    duplicateTrack,
    removeTrack,
    reorderTracks,
    saveToHistory,
  } = useTimeline();
  const { project, playback } = useVideoState();
  const { getMasksForTrack, duplicateMasksToTrack } = useMask();
  const { timeToPixel, durationToWidth } = useVideoCoordinates();

  // Timeline input handling (clip drag, trim, seek, lift)
  const {
    handlePointerDown: handleTimelinePointerDown,
    handleContainerPointerDown,
    liftedClipId,
    dropClipToTrack,
    cancelLift,
  } = useTimelineInput({
    tracksContainerRef,
    containerRef,
  });
  const {
    trackHeadersRef,
    trackHeaderWidth,
    headerWidthStyle,
    headerWidthPx,
    handleStartHeaderResize,
  } = useTimelineLayoutInput({ tracksContainerRef });

  // Track ID of the currently lifted clip (for drop-target highlighting)
  const liftedClipTrackId = liftedClipId
    ? allClips.find((c) => c.id === liftedClipId)?.trackId ?? null
    : null;

  // Escape key cancels lift
  useEffect(() => {
    if (!liftedClipId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelLift();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [liftedClipId, cancelLift]);

  // Calculate total tracks height (including mask lanes)
  const totalTracksHeight = tracks.reduce((sum, t) => {
    const hasMasks = getMasksForTrack(t.id).length > 0;
    return sum + TIMELINE.TRACK_DEFAULT_HEIGHT + (hasMasks ? MASK_LANE_HEIGHT : 0);
  }, 0);

  const rangeStart = Math.max(0, Math.min(playback.loopStart, project.duration));
  const hasRange = playback.loopEnd > rangeStart + 0.001;
  const rangeEnd = hasRange
    ? Math.max(rangeStart + 0.001, Math.min(playback.loopEnd, project.duration))
    : project.duration;
  const hasCustomRange = hasRange && (rangeStart > 0.001 || rangeEnd < project.duration - 0.001);
  const rangeStartX = timeToPixel(rangeStart);
  const rangeEndX = timeToPixel(rangeEnd);
  const timelineContentWidth = durationToWidth(project.duration);

  const handleTrackDrop = useCallback((fromTrackId: string, toTrackId: string) => {
    if (!fromTrackId || !toTrackId || fromTrackId === toTrackId) return;
    const fromIndex = tracks.findIndex((track) => track.id === fromTrackId);
    const toIndex = tracks.findIndex((track) => track.id === toTrackId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    saveToHistory();
    reorderTracks(fromIndex, toIndex);
  }, [tracks, saveToHistory, reorderTracks]);

  const handleDuplicateTrack = useCallback((trackId: string) => {
    saveToHistory();
    const duplicatedTrackId = duplicateTrack(trackId);
    if (!duplicatedTrackId) return;
    duplicateMasksToTrack(trackId, duplicatedTrackId);
  }, [saveToHistory, duplicateTrack, duplicateMasksToTrack]);

  return (
    <div className={cn("flex flex-col h-full bg-surface-primary", className)}>
      {/* Toolbar */}
      <TimelineToolbar />

      {/* Timeline container */}
      <div
        ref={containerRef}
        data-video-timeline-root=""
        className="flex-1 overflow-hidden focus:outline-none"
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.focus();
          handleContainerPointerDown(e);
        }}
      >
        {/* Track headers + ruler row */}
        <div className="flex border-b border-border-default">
          {/* Track header column */}
          <div className="flex-shrink-0 bg-surface-secondary border-r border-border-default" style={headerWidthStyle}>
            <div className="h-4" /> {/* Ruler spacer */}
          </div>
          {/* Spacer matching resize handle width */}
          <div className="w-1 shrink-0" />

          {/* Ruler */}
          <div className="flex-1 overflow-hidden">
            <TimeRuler />
          </div>
        </div>

        {/* Pre-render cache status bar */}
        <div className="flex border-b border-border-default">
          <div className="flex-shrink-0 bg-surface-secondary border-r border-border-default" style={headerWidthStyle} />
          {/* Spacer matching resize handle width */}
          <div className="w-1 shrink-0" />
          <div className="flex-1 overflow-hidden">
            <PreRenderBar />
          </div>
        </div>

        {/* Tracks area */}
        <div className="flex overflow-hidden" style={{ height: `calc(100% - 19px)` }}>
          {/* Track headers */}
          <div ref={trackHeadersRef} className="flex-shrink-0 bg-surface-secondary border-r border-border-default overflow-y-hidden" style={headerWidthStyle}>
            {tracks.map((track) => {
              const trackMasks = getMasksForTrack(track.id);
              const headerHeight = TIMELINE.TRACK_DEFAULT_HEIGHT + (trackMasks.length > 0 ? MASK_LANE_HEIGHT : 0);
              const isLiftDropTarget = !!liftedClipId && liftedClipTrackId !== track.id;
              const isLiftSource = !!liftedClipId && liftedClipTrackId === track.id;
              return (
                <div
                  key={track.id}
                  className={cn(
                    "flex items-center border-b border-border-default transition-colors",
                    trackHeaderWidth >= 120 ? "px-2" : "px-1 justify-center",
                    isLiftDropTarget && "bg-accent/20 cursor-pointer ring-1 ring-inset ring-accent",
                    isLiftSource && "opacity-50"
                  )}
                  style={{ height: headerHeight }}
                  draggable={!liftedClipId}
                  onClick={isLiftDropTarget ? () => dropClipToTrack(track.id) : undefined}
                  onDragStart={liftedClipId ? undefined : (event) => {
                    event.dataTransfer.setData("text/plain", track.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={liftedClipId ? undefined : (event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={liftedClipId ? undefined : (event) => {
                    event.preventDefault();
                    const fromTrackId = event.dataTransfer.getData("text/plain");
                    handleTrackDrop(fromTrackId, track.id);
                  }}
                >
                  {trackHeaderWidth >= 120 ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
                    <button
                      onClick={() => updateTrack(track.id, { visible: !track.visible })}
                      className={cn(
                        "shrink-0 p-1 rounded hover:bg-surface-tertiary",
                        track.visible ? "text-text-primary" : "text-text-tertiary"
                      )}
                      title={track.visible ? "Hide track" : "Show track"}
                    >
                      {track.visible ? <EyeOpenIcon className="w-3 h-3" /> : <EyeClosedIcon className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => updateTrack(track.id, { muted: !track.muted })}
                      className={cn(
                        "shrink-0 p-1 rounded hover:bg-surface-tertiary",
                        track.muted ? "text-text-tertiary" : "text-text-primary"
                      )}
                      title={track.muted ? "Unmute track" : "Mute track"}
                    >
                      {track.muted ? <TrackMutedIcon className="w-3 h-3" /> : <TrackUnmutedIcon className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => handleDuplicateTrack(track.id)}
                      className="shrink-0 p-1 rounded hover:bg-surface-tertiary text-text-tertiary hover:text-text-primary transition-colors"
                      title="Duplicate track"
                    >
                      <DuplicateIcon className="w-3 h-3" />
                    </button>
                    <span className="text-xs text-text-secondary truncate">{track.name}</span>
                    <button
                      onClick={() => { saveToHistory(); removeTrack(track.id); }}
                      className="shrink-0 p-1 rounded hover:bg-surface-tertiary text-text-tertiary hover:text-text-primary transition-colors"
                      title="Delete track"
                    >
                      <DeleteIcon className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  /* Compact mode: single menu icon → Popover with all controls */
                  <Popover
                    trigger={
                      <button className="p-1 rounded hover:bg-surface-tertiary text-text-secondary" title={track.name}>
                        <MenuIcon className="w-3 h-3" />
                      </button>
                    }
                    align="start"
                    side="bottom"
                    closeOnScroll={false}
                  >
                    <div className="flex flex-col gap-0.5 p-1.5 min-w-[140px]">
                      <span className="text-xs font-medium text-text-primary px-2 py-1 truncate">{track.name}</span>
                      <button
                        onClick={() => updateTrack(track.id, { visible: !track.visible })}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary text-xs text-text-secondary"
                      >
                        {track.visible ? <EyeOpenIcon className="w-3 h-3" /> : <EyeClosedIcon className="w-3 h-3" />}
                        {track.visible ? "Hide" : "Show"}
                      </button>
                      <button
                        onClick={() => updateTrack(track.id, { muted: !track.muted })}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary text-xs text-text-secondary"
                      >
                        {track.muted ? <TrackMutedIcon className="w-3 h-3" /> : <TrackUnmutedIcon className="w-3 h-3" />}
                        {track.muted ? "Unmute" : "Mute"}
                      </button>
                      <button
                        onClick={() => handleDuplicateTrack(track.id)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary text-xs text-text-secondary"
                      >
                        <DuplicateIcon className="w-3 h-3" />
                        Duplicate
                      </button>
                      <div className="h-px bg-border-default mx-1" />
                      <button
                        onClick={() => {
                          const idx = tracks.findIndex(t => t.id === track.id);
                          if (idx > 0) { saveToHistory(); reorderTracks(idx, idx - 1); }
                        }}
                        disabled={tracks.findIndex(t => t.id === track.id) === 0}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary text-xs text-text-secondary disabled:opacity-30"
                      >
                        <ChevronDownIcon className="w-3 h-3 rotate-180" />
                        Move Up
                      </button>
                      <button
                        onClick={() => {
                          const idx = tracks.findIndex(t => t.id === track.id);
                          if (idx < tracks.length - 1) { saveToHistory(); reorderTracks(idx, idx + 1); }
                        }}
                        disabled={tracks.findIndex(t => t.id === track.id) === tracks.length - 1}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary text-xs text-text-secondary disabled:opacity-30"
                      >
                        <ChevronDownIcon className="w-3 h-3" />
                        Move Down
                      </button>
                      <div className="h-px bg-border-default mx-1" />
                      <button
                        onClick={() => { saveToHistory(); removeTrack(track.id); }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary text-xs text-red-400"
                      >
                        <DeleteIcon className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </Popover>
                )}
                </div>
              );
            })}
          </div>

          {/* Track header/content resize handle */}
          <div
            className="w-1 shrink-0 cursor-ew-resize touch-none bg-border-default hover:bg-accent transition-colors relative"
            onPointerDown={handleStartHeaderResize}
            title="Resize track headers"
          >
            {/* Invisible extended hit area for easier touch/click */}
            <div className="absolute -left-2.5 -right-2.5 top-0 bottom-0 z-10" />
          </div>

          {/* Tracks content */}
          <div
            ref={tracksContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden relative touch-none"
            style={{ minWidth: `calc(100% - ${headerWidthPx})` }}
            onPointerDown={handleTimelinePointerDown}
          >
            {/* Background for click handling */}
            <div
              className="timeline-bg absolute inset-0"
              style={{ minWidth: timelineContentWidth }}
            />

            {/* Tracks */}
            <div className="relative" style={{ minWidth: timelineContentWidth }}>
              {hasCustomRange && (
                <>
                  <div
                    className="absolute top-0 left-0 bottom-0 z-10 pointer-events-none bg-black/35"
                    style={{ width: Math.max(0, rangeStartX) }}
                  />
                  <div
                    className="absolute top-0 bottom-0 z-10 pointer-events-none bg-black/35"
                    style={{
                      left: Math.max(0, rangeEndX),
                      right: 0,
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 z-10 pointer-events-none border-l border-accent-primary/80"
                    style={{ left: Math.max(0, rangeStartX) }}
                  />
                  <div
                    className="absolute top-0 bottom-0 z-10 pointer-events-none border-l border-accent-primary/80"
                    style={{ left: Math.max(0, rangeEndX) }}
                  />
                </>
              )}

              {tracks.map((track) => (
                <Track
                  key={track.id}
                  track={track}
                  clips={getClipsInTrack(track.id)}
                  masks={getMasksForTrack(track.id)}
                  liftedClipId={liftedClipId}
                  isLiftDropTarget={!!liftedClipId && liftedClipTrackId !== track.id}
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
