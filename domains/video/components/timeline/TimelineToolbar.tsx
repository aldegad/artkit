"use client";

import { useRef, useState, useEffect } from "react";
import { useTimeline, useVideoState } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { PlusIcon, SnapIcon, SnapOffIcon, FilmStripIcon, LoopIcon, LoopOffIcon, RazorToolIcon } from "@/shared/components/icons";
import Tooltip from "@/shared/components/Tooltip";
import { Popover } from "@/shared/components";
import { NumberScrubber } from "@/shared/components";
import { TIMELINE } from "../../constants";

interface TimelineToolbarProps {
  className?: string;
}

export function TimelineToolbar({ className }: TimelineToolbarProps) {
  const { viewState, setZoom, toggleSnap, addTrack, clips, splitClipAtTime } = useTimeline();
  const {
    playback,
    currentTimeRef,
    project,
    selectedClipIds,
    selectClip,
    setLoopRange,
    clearLoopRange,
    toggleLoop,
  } = useVideoState();

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);
  const projectDuration = Math.max(project.duration || 0, 0);
  const rangeStart = Math.max(0, Math.min(playback.loopStart, projectDuration));
  const hasRange = playback.loopEnd > rangeStart + 0.001;
  const rangeEnd = hasRange
    ? Math.max(rangeStart + 0.001, Math.min(playback.loopEnd, projectDuration))
    : projectDuration;
  const hasCustomRange = hasRange && (rangeStart > 0.001 || rangeEnd < projectDuration - 0.001);
  const selectedClipId = selectedClipIds[selectedClipIds.length - 1] || null;
  const selectedClip = selectedClipId
    ? clips.find((clip) => clip.id === selectedClipId) ?? null
    : null;
  const canSplitSelectedClip = Boolean(
    selectedClip
    && currentTimeRef.current > selectedClip.startTime + TIMELINE.CLIP_MIN_DURATION
    && currentTimeRef.current < selectedClip.startTime + selectedClip.duration - TIMELINE.CLIP_MIN_DURATION
  );

  const setInPoint = () => {
    if (projectDuration <= 0) return;
    const current = Math.max(0, Math.min(currentTimeRef.current, projectDuration));
    const nextEnd = hasCustomRange ? rangeEnd : projectDuration;
    setLoopRange(current, nextEnd, true);
  };

  const setOutPoint = () => {
    if (projectDuration <= 0) return;
    const current = Math.max(0, Math.min(currentTimeRef.current, projectDuration));
    const nextStart = hasCustomRange ? rangeStart : 0;
    setLoopRange(nextStart, current, true);
  };

  const splitSelectedClipAtPlayhead = () => {
    if (!selectedClipId) return;
    const splitClipId = splitClipAtTime(selectedClipId, currentTimeRef.current);
    if (splitClipId) {
      selectClip(splitClipId, false);
    }
  };

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
            <div className="flex flex-col gap-0.5 p-1.5 min-w-[220px]">
              <button
                onClick={() => addTrack()}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary text-text-secondary text-xs transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                <span>Add Layer</span>
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
              <button
                onClick={splitSelectedClipAtPlayhead}
                disabled={!canSplitSelectedClip}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
                  canSplitSelectedClip
                    ? "hover:bg-surface-tertiary text-text-secondary"
                    : "text-text-quaternary cursor-not-allowed"
                )}
                title="Split selected clip at playhead"
              >
                <RazorToolIcon className="w-4 h-4 rotate-90" />
                <span>Cut at Playhead</span>
              </button>
              <div className="flex items-center gap-1 px-2 pt-1">
                <button
                  onClick={setInPoint}
                  className="px-1.5 py-1 rounded text-[10px] bg-surface-tertiary hover:bg-interactive-hover text-text-secondary transition-colors"
                  title="Set IN point at current time"
                >
                  IN
                </button>
                <button
                  onClick={setOutPoint}
                  className="px-1.5 py-1 rounded text-[10px] bg-surface-tertiary hover:bg-interactive-hover text-text-secondary transition-colors"
                  title="Set OUT point at current time"
                >
                  OUT
                </button>
                <button
                  onClick={() => clearLoopRange()}
                  disabled={!hasCustomRange}
                  className={cn(
                    "px-1.5 py-1 rounded text-[10px] transition-colors",
                    hasCustomRange
                      ? "bg-surface-tertiary hover:bg-interactive-hover text-text-secondary"
                      : "bg-surface-tertiary/50 text-text-quaternary cursor-not-allowed"
                  )}
                  title="Clear playback range"
                >
                  CLR
                </button>
                <button
                  onClick={toggleLoop}
                  className={cn(
                    "p-1 rounded transition-colors ml-auto",
                    playback.loop
                      ? "text-accent hover:bg-accent/20"
                      : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
                  )}
                  title={playback.loop ? "Loop: On" : "Loop: Off"}
                >
                  {playback.loop ? <LoopIcon className="w-3.5 h-3.5" /> : <LoopOffIcon className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </Popover>
        </>
      ) : (
        <>
          {/* Normal mode: all buttons visible */}
          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">Add Layer</span>
                <span className="text-text-tertiary text-[11px]">Add a new timeline layer</span>
              </div>
            }
          >
            <button
              onClick={() => addTrack()}
              className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
            >
              <PlusIcon />
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

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">Cut at Playhead</span>
                <span className="text-text-tertiary text-[11px]">Split selected clip at current time</span>
              </div>
            }
          >
            <button
              onClick={splitSelectedClipAtPlayhead}
              disabled={!canSplitSelectedClip}
              className={cn(
                "p-1.5 rounded transition-colors",
                canSplitSelectedClip
                  ? "hover:bg-surface-tertiary text-text-secondary hover:text-text-primary"
                  : "text-text-quaternary cursor-not-allowed"
              )}
              title="Split selected clip at playhead"
            >
              <RazorToolIcon className="w-4 h-4 rotate-90" />
            </button>
          </Tooltip>

          <div className="flex items-center gap-1">
            <button
              onClick={setInPoint}
              className="px-1.5 py-1 rounded text-[10px] bg-surface-tertiary hover:bg-interactive-hover text-text-secondary transition-colors"
              title="Set IN point at current time"
            >
              IN
            </button>
            <button
              onClick={setOutPoint}
              className="px-1.5 py-1 rounded text-[10px] bg-surface-tertiary hover:bg-interactive-hover text-text-secondary transition-colors"
              title="Set OUT point at current time"
            >
              OUT
            </button>
            <button
              onClick={() => clearLoopRange()}
              disabled={!hasCustomRange}
              className={cn(
                "px-1.5 py-1 rounded text-[10px] transition-colors",
                hasCustomRange
                  ? "bg-surface-tertiary hover:bg-interactive-hover text-text-secondary"
                  : "bg-surface-tertiary/50 text-text-quaternary cursor-not-allowed"
              )}
              title="Clear playback range"
            >
              CLR
            </button>
            <button
              onClick={toggleLoop}
              className={cn(
                "p-1.5 rounded transition-colors",
                playback.loop
                  ? "text-accent hover:bg-accent/20"
                  : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
              )}
              title={playback.loop ? "Loop: On" : "Loop: Off"}
            >
              {playback.loop ? <LoopIcon className="w-4 h-4" /> : <LoopOffIcon className="w-4 h-4" />}
            </button>
          </div>
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
