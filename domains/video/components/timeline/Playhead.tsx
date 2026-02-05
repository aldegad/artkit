"use client";

import { useVideoState } from "../../contexts";
import { useVideoCoordinates } from "../../hooks";
import { cn } from "@/shared/utils/cn";
import { TIMELINE } from "../../constants";

interface PlayheadProps {
  className?: string;
  height: number;
}

export function Playhead({ className, height }: PlayheadProps) {
  const { playback } = useVideoState();
  const { timeToPixel } = useVideoCoordinates();

  const x = timeToPixel(playback.currentTime);

  // Don't render if off-screen
  if (x < 0) return null;

  return (
    <div
      className={cn(
        "absolute top-0 pointer-events-none z-20",
        className
      )}
      style={{
        left: x,
        height,
        width: TIMELINE.PLAYHEAD_WIDTH,
        backgroundColor: "var(--canvas-waveform-playhead, #ef4444)",
      }}
    >
      {/* Playhead handle at top */}
      <div
        className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45"
        style={{
          backgroundColor: "var(--canvas-waveform-playhead, #ef4444)",
        }}
      />
    </div>
  );
}
