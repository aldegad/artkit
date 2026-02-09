"use client";

import { useVideoState } from "../../contexts";
import { usePlaybackTime } from "../../hooks";
import { cn } from "@/shared/utils/cn";
import { StopIcon, StepBackwardIcon, PlayIcon, PauseIcon, StepForwardIcon, LoopIcon, LoopOffIcon } from "@/shared/components/icons";
import { PLAYBACK } from "../../constants";

interface PreviewControlsProps {
  className?: string;
}

export function PreviewControls({ className }: PreviewControlsProps) {
  const {
    playback,
    stop,
    togglePlay,
    toggleLoop,
    setLoopRange,
    clearLoopRange,
    stepForward,
    stepBackward,
    currentTimeRef,
    project,
  } = useVideoState();

  // Throttled time for display — 10fps is enough for human-readable text
  const displayTime = usePlaybackTime(PLAYBACK.TIME_DISPLAY_THROTTLE_MS);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30); // Assume 30fps
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  const projectDuration = Math.max(project.duration || 0, 0);
  const rangeStart = Math.max(0, Math.min(playback.loopStart, projectDuration));
  const hasRange = playback.loopEnd > rangeStart + 0.001;
  const rangeEnd = hasRange
    ? Math.max(rangeStart + 0.001, Math.min(playback.loopEnd, projectDuration))
    : projectDuration;
  const hasCustomRange = hasRange && (rangeStart > 0.001 || rangeEnd < projectDuration - 0.001);
  const rangeDuration = hasCustomRange ? Math.max(0, rangeEnd - rangeStart) : projectDuration;
  const displayWithinRange = hasCustomRange
    ? Math.max(0, Math.min(displayTime, rangeEnd) - rangeStart)
    : displayTime;

  const setInPoint = () => {
    const current = currentTimeRef.current;
    const nextEnd = hasCustomRange ? rangeEnd : projectDuration;
    setLoopRange(current, nextEnd, true);
  };

  const setOutPoint = () => {
    const current = currentTimeRef.current;
    const nextStart = hasCustomRange ? rangeStart : 0;
    setLoopRange(nextStart, current, true);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 px-2 py-1.5 bg-surface-secondary border-t border-border-default",
        className
      )}
    >
      {/* Time display */}
      <div className="font-mono text-xs text-text-secondary min-w-[68px]">
        {formatTime(displayWithinRange)}
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={stop}
          className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
        >
          <StopIcon />
        </button>

        <button
          onClick={stepBackward}
          className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
        >
          <StepBackwardIcon />
        </button>

        <button
          onClick={togglePlay}
          className="p-1.5 rounded bg-accent hover:bg-accent-hover text-white transition-colors"
        >
          {playback.isPlaying ? (
            <PauseIcon className="w-4 h-4" />
          ) : (
            <PlayIcon className="w-4 h-4" />
          )}
        </button>

        <button
          onClick={stepForward}
          className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
        >
          <StepForwardIcon />
        </button>
      </div>

      {/* Duration display */}
      <div className="font-mono text-xs text-text-tertiary min-w-[68px] text-right">
        / {formatTime(rangeDuration)}
      </div>

      {/* Range controls */}
      <div className="flex items-center gap-1 ml-1">
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
          onClick={clearLoopRange}
          className="px-1.5 py-1 rounded text-[10px] bg-surface-tertiary hover:bg-interactive-hover text-text-secondary transition-colors"
          title="Clear playback range"
        >
          CLR
        </button>
      </div>

      {hasCustomRange && (
        <div className="font-mono text-[10px] text-accent min-w-[140px] text-right">
          {formatTime(rangeStart)} - {formatTime(rangeEnd)}
        </div>
      )}

      {/* Loop toggle */}
      <button
        onClick={toggleLoop}
        className={cn(
          "p-1.5 rounded transition-colors ml-1",
          playback.loop
            ? "text-accent hover:bg-accent/20"
            : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
        )}
        title={playback.loop ? "Loop: On" : "Loop: Off"}
      >
        {playback.loop ? (
          <LoopIcon className="w-4 h-4" />
        ) : (
          <LoopOffIcon className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
