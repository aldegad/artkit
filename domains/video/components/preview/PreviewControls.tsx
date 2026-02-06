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
        "flex items-center justify-center gap-2 px-4 py-2 bg-surface-secondary border-t border-border-default",
        className
      )}
    >
      {/* Time display */}
      <div className="font-mono text-sm text-text-secondary min-w-[100px]">
        {formatTime(playback.currentTime)}
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-1">
        {/* Stop */}
        <button
          onClick={stop}
          className="p-2 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
          title="Stop"
        >
          <StopIcon />
        </button>

        {/* Step backward */}
        <button
          onClick={stepBackward}
          className="p-2 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
          title="Previous Frame"
        >
          <StepBackwardIcon />
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="p-2 rounded bg-accent hover:bg-accent-hover text-white transition-colors"
          title={playback.isPlaying ? "Pause" : "Play"}
        >
          {playback.isPlaying ? (
            <PauseIcon className="w-5 h-5" />
          ) : (
            <PlayIcon className="w-5 h-5" />
          )}
        </button>

        {/* Step forward */}
        <button
          onClick={stepForward}
          className="p-2 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
          title="Next Frame"
        >
          <StepForwardIcon />
        </button>
      </div>

      {/* Duration display */}
      <div className="font-mono text-sm text-text-tertiary min-w-[100px] text-right">
        / {formatTime(project.duration || 0)}
      </div>
    </div>
  );
}
