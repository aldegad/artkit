"use client";

import { useCallback, useMemo } from "react";
import { MaskData } from "../../types";
import { useVideoCoordinates } from "../../hooks";
import { useMask } from "../../contexts";
import { cn } from "@/shared/utils/cn";

interface MaskClipProps {
  mask: MaskData;
}

export function MaskClip({ mask }: MaskClipProps) {
  const { timeToPixel, durationToWidth } = useVideoCoordinates();
  const { activeMaskId, selectMask } = useMask();

  const isActive = activeMaskId === mask.id;
  const x = timeToPixel(mask.startTime);
  const width = Math.max(durationToWidth(mask.duration), 20);

  // Position keyframe diamonds relative to the mask clip
  const keyframeDiamonds = useMemo(() => {
    if (!mask.keyframes || mask.keyframes.length === 0) return [];
    const maskWidth = durationToWidth(mask.duration);
    return mask.keyframes.map((kf) => {
      const ratio = mask.duration > 0 ? kf.time / mask.duration : 0;
      return {
        id: kf.id,
        left: Math.max(2, Math.min(maskWidth - 6, ratio * maskWidth - 3)),
      };
    });
  }, [mask.keyframes, mask.duration, durationToWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    selectMask(mask.id);
  }, [selectMask, mask.id]);

  return (
    <div
      className={cn(
        "absolute top-0.5 bottom-0.5 rounded cursor-pointer",
        "bg-purple-600/70 hover:bg-purple-500/70",
        isActive && "ring-1 ring-purple-300 bg-purple-500/80"
      )}
      style={{
        left: x,
        width,
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <div className="px-1.5 py-0.5 text-[10px] text-white/80 truncate leading-tight">
        Mask
      </div>

      {/* Keyframe diamonds */}
      {keyframeDiamonds.map((kf) => (
        <div
          key={kf.id}
          className="absolute bottom-0.5 w-[6px] h-[6px] bg-yellow-400 rotate-45"
          style={{ left: kf.left }}
        />
      ))}
    </div>
  );
}
