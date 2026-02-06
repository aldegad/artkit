"use client";

import { useRef } from "react";
import { useVideoState } from "../../contexts";
import { useVideoCoordinates, usePlaybackTick } from "../../hooks";
import { cn } from "@/shared/utils/cn";
import { TIMELINE } from "../../constants";

interface PlayheadProps {
  className?: string;
  height: number;
}

export function Playhead({ className, height }: PlayheadProps) {
  const { playback } = useVideoState();
  const { timeToPixel } = useVideoCoordinates();
  const divRef = useRef<HTMLDivElement>(null);

  // Initial position from state (for first render and when paused)
  const initialX = timeToPixel(playback.currentTime);

  // Center the playhead line on the computed time position
  const halfWidth = TIMELINE.PLAYHEAD_WIDTH / 2;

  // Update DOM directly during playback — no React re-renders
  usePlaybackTick((time) => {
    if (!divRef.current) return;
    const x = timeToPixel(time);
    if (x < 0) {
      divRef.current.style.display = "none";
    } else {
      divRef.current.style.display = "";
      divRef.current.style.left = `${x - halfWidth}px`;
    }
  });

  // Don't render if off-screen
  if (initialX < 0) return null;

  return (
    <div
      ref={divRef}
      className={cn(
        "absolute top-0 pointer-events-none z-20",
        className
      )}
      style={{
        left: initialX - halfWidth,
        height,
        width: TIMELINE.PLAYHEAD_WIDTH,
        backgroundColor: "var(--waveform-playhead, #FF8C00)",
      }}
    >
      {/* Playhead handle at top */}
      <div
        className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45"
        style={{
          backgroundColor: "var(--waveform-playhead, #FF8C00)",
        }}
      />
    </div>
  );
}
