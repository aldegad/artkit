"use client";

import { useRef, useCallback, useEffect, useState } from "react";
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
import { MASK_LANE_HEIGHT, TIMELINE, TRANSFORM_LANE_HEIGHT } from "../../constants";
import {
  hasClipPositionKeyframeAtTimelineTime,
  removeClipPositionKeyframeAtTimelineTime,
  removeClipPositionKeyframeById,
  resolveClipPositionAtTimelineTime,
  upsertClipPositionKeyframeAtTimelineTime,
} from "../../utils/clipTransformKeyframes";

interface TimelineProps {
  className?: string;
}

interface OffsetNumberInputProps {
  value: number;
  onCommit: (value: number) => void;
}

function OffsetNumberInput({ value, onCommit }: OffsetNumberInputProps) {
  const [draft, setDraft] = useState<string>(() => String(Math.round(value)));

  useEffect(() => {
    setDraft(String(Math.round(value)));
  }, [value]);

  const commit = useCallback(() => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(Math.round(value)));
      return;
    }
    onCommit(next);
  }, [draft, onCommit, value]);

  return (
    <input
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(String(Math.round(value)));
          e.currentTarget.blur();
        }
      }}
      className="w-12 px-1 py-0.5 rounded border border-border-default bg-surface-primary text-[10px] text-text-primary focus:outline-none focus:border-accent-primary"
    />
  );
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
    updateClip,
    duplicateTrack,
    removeTrack,
    reorderTracks,
    saveToHistory,
  } = useTimeline();
  const {
    project,
    playback,
    selectedClipIds,
    selectedPositionKeyframe,
    setSelectedPositionKeyframe,
  } = useVideoState();
  const { getMasksForTrack, duplicateMasksToTrack } = useMask();
  const { timeToPixel, durationToWidth } = useVideoCoordinates();
  const [transformLaneOpenByTrack, setTransformLaneOpenByTrack] = useState<Record<string, boolean>>({});

  const isTransformLaneOpen = useCallback(
    (trackId: string) => Boolean(transformLaneOpenByTrack[trackId]),
    [transformLaneOpenByTrack]
  );

  const toggleTransformLane = useCallback((trackId: string) => {
    setTransformLaneOpenByTrack((prev) => ({
      ...prev,
      [trackId]: !prev[trackId],
    }));
  }, []);

  const getTransformLaneHeight = useCallback(
    (trackId: string) => (isTransformLaneOpen(trackId) ? TRANSFORM_LANE_HEIGHT : 0),
    [isTransformLaneOpen]
  );

  // Remove stale lane states when tracks are deleted.
  useEffect(() => {
    const trackIds = new Set(tracks.map((track) => track.id));
    setTransformLaneOpenByTrack((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [trackId, isOpen] of Object.entries(prev)) {
        if (trackIds.has(trackId)) {
          next[trackId] = isOpen;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tracks]);

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
    getTransformLaneHeight,
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
    return sum
      + TIMELINE.TRACK_DEFAULT_HEIGHT
      + getTransformLaneHeight(t.id)
      + (hasMasks ? MASK_LANE_HEIGHT : 0);
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
        className="flex-1 overflow-hidden overscroll-x-none focus:outline-none"
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
              const trackClips = getClipsInTrack(track.id);
              const trackMasks = getMasksForTrack(track.id);
              const visualTrackClips = trackClips.filter((clip) => clip.type !== "audio");
              const transformLaneOpen = isTransformLaneOpen(track.id);
              const transformLaneHeight = transformLaneOpen ? TRANSFORM_LANE_HEIGHT : 0;
              const headerHeight = TIMELINE.TRACK_DEFAULT_HEIGHT + transformLaneHeight + (trackMasks.length > 0 ? MASK_LANE_HEIGHT : 0);
              const selectedVisualClipInTrack =
                selectedClipIds
                  .map((selectedClipId) => visualTrackClips.find((clip) => clip.id === selectedClipId))
                  .find((clip): clip is (typeof visualTrackClips)[number] => !!clip) ?? null;
              const selectedPositionAtPlayhead = selectedVisualClipInTrack
                ? resolveClipPositionAtTimelineTime(selectedVisualClipInTrack, playback.currentTime)
                : null;
              const hasKeyframeAtPlayhead = selectedVisualClipInTrack
                ? hasClipPositionKeyframeAtTimelineTime(selectedVisualClipInTrack, playback.currentTime)
                : false;
              const selectedKeyframeInTrack = selectedPositionKeyframe?.trackId === track.id
                ? selectedPositionKeyframe
                : null;
              const isLiftDropTarget = !!liftedClipId && liftedClipTrackId !== track.id;
              const isLiftSource = !!liftedClipId && liftedClipTrackId === track.id;

              const handleSetSelectedOffsetAtPlayhead = (nextPosition: { x: number; y: number }) => {
                if (!selectedVisualClipInTrack) return;
                saveToHistory();
                updateClip(
                  selectedVisualClipInTrack.id,
                  upsertClipPositionKeyframeAtTimelineTime(
                    selectedVisualClipInTrack,
                    playback.currentTime,
                    nextPosition,
                    { ensureInitialKeyframe: true }
                  )
                );
              };

              const handleToggleKeyframeAtPlayhead = () => {
                if (!selectedVisualClipInTrack || !selectedPositionAtPlayhead) return;
                saveToHistory();
                if (hasKeyframeAtPlayhead) {
                  const result = removeClipPositionKeyframeAtTimelineTime(
                    selectedVisualClipInTrack,
                    playback.currentTime
                  );
                  if (result.removed) {
                    updateClip(selectedVisualClipInTrack.id, result.updates);
                  }
                  setSelectedPositionKeyframe(null);
                  return;
                }
                updateClip(
                  selectedVisualClipInTrack.id,
                  upsertClipPositionKeyframeAtTimelineTime(
                    selectedVisualClipInTrack,
                    playback.currentTime,
                    selectedPositionAtPlayhead,
                    { ensureInitialKeyframe: true }
                  )
                );
                setSelectedPositionKeyframe(null);
              };

              const handleDeleteSelectedKeyframeInTrack = () => {
                if (!selectedKeyframeInTrack) return;
                const targetClip = visualTrackClips.find((clip) => clip.id === selectedKeyframeInTrack.clipId);
                if (!targetClip) {
                  setSelectedPositionKeyframe(null);
                  return;
                }
                saveToHistory();
                const result = removeClipPositionKeyframeById(targetClip, selectedKeyframeInTrack.keyframeId);
                if (result.removed) {
                  updateClip(targetClip.id, result.updates);
                }
                setSelectedPositionKeyframe(null);
              };

              return (
                <div
                  key={track.id}
                  className={cn(
                    "border-b border-border-default transition-colors",
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
                  <div
                    className={cn(
                      "flex items-center",
                      trackHeaderWidth >= 120 ? "px-2" : "px-1 justify-center"
                    )}
                    style={{ height: TIMELINE.TRACK_DEFAULT_HEIGHT }}
                  >
                    {trackHeaderWidth >= 120 ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
                        <button
                          onClick={() => toggleTransformLane(track.id)}
                          className={cn(
                            "shrink-0 p-1 rounded hover:bg-surface-tertiary transition-colors",
                            transformLaneOpen ? "text-accent-primary" : "text-text-tertiary"
                          )}
                          title={transformLaneOpen ? "Hide transform lane" : "Show transform lane"}
                        >
                          <ChevronDownIcon className={cn("w-3 h-3 transition-transform", !transformLaneOpen && "-rotate-90")} />
                        </button>
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
                            onClick={() => toggleTransformLane(track.id)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary text-xs text-text-secondary"
                          >
                            <ChevronDownIcon className={cn("w-3 h-3 transition-transform", !transformLaneOpen && "-rotate-90")} />
                            {transformLaneOpen ? "Hide Transform Lane" : "Show Transform Lane"}
                          </button>
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

                  {transformLaneOpen && (
                    <div
                      className="border-t border-border-default/50 bg-surface-primary/50 px-1.5 flex items-center gap-1 overflow-hidden"
                      style={{ height: TRANSFORM_LANE_HEIGHT }}
                    >
                      <span className="text-[10px] uppercase tracking-wide text-text-secondary font-medium shrink-0">
                        Transform
                      </span>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleKeyframeAtPlayhead();
                        }}
                        disabled={!selectedVisualClipInTrack}
                        title={hasKeyframeAtPlayhead ? "Remove keyframe at playhead" : "Add keyframe at playhead"}
                        className={cn(
                          "w-3 h-3 rotate-45 border shrink-0",
                          selectedVisualClipInTrack
                            ? hasKeyframeAtPlayhead
                              ? "bg-accent-primary border-accent-primary"
                              : "border-border-default hover:border-accent-primary"
                            : "border-border-default opacity-40 cursor-not-allowed"
                        )}
                      />

                      {selectedPositionAtPlayhead ? (
                        <>
                          <span className="text-[10px] text-cyan-300 shrink-0">X</span>
                          <OffsetNumberInput
                            value={selectedPositionAtPlayhead.x}
                            onCommit={(x) => handleSetSelectedOffsetAtPlayhead({
                              x,
                              y: selectedPositionAtPlayhead.y,
                            })}
                          />
                          <span className="text-[10px] text-orange-300 shrink-0">Y</span>
                          <OffsetNumberInput
                            value={selectedPositionAtPlayhead.y}
                            onCommit={(y) => handleSetSelectedOffsetAtPlayhead({
                              x: selectedPositionAtPlayhead.x,
                              y,
                            })}
                          />
                        </>
                      ) : (
                        <span className="text-[10px] text-text-quaternary truncate">Select visual clip</span>
                      )}

                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSelectedKeyframeInTrack();
                        }}
                        disabled={!selectedKeyframeInTrack}
                        className={cn(
                          "ml-auto p-1 rounded transition-colors",
                          selectedKeyframeInTrack
                            ? "text-text-secondary hover:text-red-400 hover:bg-red-500/15"
                            : "text-text-quaternary cursor-not-allowed"
                        )}
                        title="Delete selected keyframe"
                      >
                        <DeleteIcon className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {trackMasks.length > 0 && (
                    <div
                      className="border-t border-border-default/50 bg-surface-tertiary/30"
                      style={{ height: MASK_LANE_HEIGHT }}
                    />
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
            data-video-timeline-tracks=""
            className="flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none relative touch-none"
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
                  transformLaneOpen={isTransformLaneOpen(track.id)}
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
