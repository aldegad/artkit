"use client";

import { useVideoState } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { StopIcon, StepBackwardIcon, PlayIcon, PauseIcon, StepForwardIcon } from "@/shared/components/icons";

interface PreviewControlsProps {
  className?: string;
}

export function PreviewControls({ className }: PreviewControlsProps) {
  const {
    playback,
    stop,
    togglePlay,
    stepForward,
    stepBackward,
    project,
  } = useVideoState();

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30); // Assume 30fps
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
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
        {formatTime(playback.currentTime)}
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
        / {formatTime(project.duration || 0)}
      </div>
    </div>
  );
}
