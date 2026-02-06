"use client";

import { ClipBufferRange } from "../../hooks/useClipBufferRanges";

interface ClipBufferBarProps {
  bufferRanges: ClipBufferRange[];
  clipDuration: number;
}

export function ClipBufferBar({ bufferRanges, clipDuration }: ClipBufferBarProps) {
  if (clipDuration <= 0 || bufferRanges.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-clip-buffer-bg pointer-events-none rounded-b overflow-hidden">
      {bufferRanges.map((range, idx) => {
        const leftPct = (range.start / clipDuration) * 100;
        const widthPct = ((range.end - range.start) / clipDuration) * 100;
        return (
          <div
            key={idx}
            className="absolute top-0 bottom-0 bg-clip-buffer-loaded"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
            }}
          />
        );
      })}
    </div>
  );
}
