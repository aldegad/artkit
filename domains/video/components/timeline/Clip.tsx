"use client";

import { useMemo } from "react";
import { Clip as ClipType } from "../../types";
import { useVideoCoordinates } from "../../hooks";
import { useVideoState } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { UI } from "../../constants";

interface ClipProps {
  clip: ClipType;
}

export function Clip({ clip }: ClipProps) {
  const { timeToPixel, durationToWidth } = useVideoCoordinates();
  const { selectedClipIds } = useVideoState();

  const isSelected = selectedClipIds.includes(clip.id);
  const x = timeToPixel(clip.startTime);
  const width = durationToWidth(clip.duration);

  // Don't render if clip would be invisible
  const minWidth = Math.max(width, UI.MIN_CLIP_WIDTH);

  const clipColor = useMemo(() => {
    if (clip.type === "video") {
      return "bg-blue-600/80";
    }
    return "bg-green-600/80";
  }, [clip.type]);

  // Note: Click/drag events are handled by useTimelineInput in Timeline component

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 rounded cursor-pointer transition-all",
        clipColor,
        isSelected && "ring-2 ring-white ring-offset-1 ring-offset-transparent",
        !clip.visible && "opacity-50"
      )}
      style={{
        left: x,
        width: minWidth,
      }}
    >
      {/* Clip name */}
      <div className="px-2 py-1 text-xs text-white truncate">
        {clip.name}
      </div>

      {/* Trim handles */}
      {isSelected && (
        <>
          {/* Left trim handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 bg-white/50 hover:bg-white/80 cursor-ew-resize rounded-l"
          />
          {/* Right trim handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1.5 bg-white/50 hover:bg-white/80 cursor-ew-resize rounded-r"
          />
        </>
      )}

      {/* Type indicator */}
      <div className="absolute bottom-1 right-1">
        {clip.type === "video" ? (
          <svg className="w-3 h-3 text-white/60" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 3h8v10H2V3zm10 2l4-2v10l-4-2V5z" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-white/60" viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="2" width="12" height="12" rx="1" />
          </svg>
        )}
      </div>
    </div>
  );
}
