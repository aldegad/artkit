"use client";

import { useVideoState } from "../../contexts";
import { cn } from "@/shared/utils/cn";

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
        "flex items-center justify-center gap-2 px-4 py-2 bg-surface-secondary border-t border-border",
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
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" />
          </svg>
        </button>

        {/* Step backward */}
        <button
          onClick={stepBackward}
          className="p-2 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
          title="Previous Frame"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="3" width="2" height="10" />
            <path d="M14 3L6 8L14 13V3Z" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="p-2 rounded bg-accent hover:bg-accent-hover text-white transition-colors"
          title={playback.isPlaying ? "Pause" : "Play"}
        >
          {playback.isPlaying ? (
            <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="4" height="12" />
              <rect x="9" y="2" width="4" height="12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2L14 8L4 14V2Z" />
            </svg>
          )}
        </button>

        {/* Step forward */}
        <button
          onClick={stepForward}
          className="p-2 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
          title="Next Frame"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 3L10 8L2 13V3Z" />
            <rect x="12" y="3" width="2" height="10" />
          </svg>
        </button>
      </div>

      {/* Duration display */}
      <div className="font-mono text-sm text-text-tertiary min-w-[100px] text-right">
        / {formatTime(project.duration || 0)}
      </div>
    </div>
  );
}
