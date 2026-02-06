"use client";

import { VideoTrack, Clip as ClipType } from "../../types";
import { Clip } from "./Clip";
import { cn } from "@/shared/utils/cn";

interface TrackProps {
  track: VideoTrack;
  clips: ClipType[];
  className?: string;
}

export function Track({ track, clips, className }: TrackProps) {
  return (
    <div
      className={cn(
        "relative border-b border-border-default",
        !track.visible && "opacity-50",
        track.locked && "pointer-events-none",
        className
      )}
      style={{ height: track.height }}
    >
      {/* Track background */}
      <div className="absolute inset-0 bg-surface-secondary/50" />

      {/* Clips */}
      {clips.map((clip) => (
        <Clip
          key={clip.id}
          clip={clip}
        />
      ))}
    </div>
  );
}
