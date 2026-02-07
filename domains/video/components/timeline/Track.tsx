"use client";

import { VideoTrack, Clip as ClipType, MaskData } from "../../types";
import { Clip } from "./Clip";
import { MaskClip } from "./MaskClip";
import { cn } from "@/shared/utils/cn";
import { MASK_LANE_HEIGHT } from "../../constants";

interface TrackProps {
  track: VideoTrack;
  clips: ClipType[];
  masks: MaskData[];
  liftedClipId?: string | null;
  isLiftDropTarget?: boolean;
  className?: string;
}

export function Track({ track, clips, masks, liftedClipId, isLiftDropTarget, className }: TrackProps) {
  const hasMasks = masks.length > 0;
  const totalHeight = track.height + (hasMasks ? MASK_LANE_HEIGHT : 0);

  return (
    <div
      className={cn(
        "relative border-b border-border-default",
        !track.visible && "opacity-50",
        track.locked && "pointer-events-none",
        className
      )}
      style={{ height: totalHeight }}
    >
      {/* Clips area */}
      <div className="relative" style={{ height: track.height }}>
        <div className={cn(
          "absolute inset-0 bg-surface-secondary/50 transition-colors",
          isLiftDropTarget && "bg-accent/10"
        )} />
        {clips.map((clip) => (
          <Clip key={clip.id} clip={clip} isLifted={liftedClipId === clip.id} />
        ))}
      </div>

      {/* Mask lane */}
      {hasMasks && (
        <div
          className="relative bg-surface-tertiary/30 border-t border-border-default/50"
          style={{ height: MASK_LANE_HEIGHT }}
        >
          {masks.map((mask) => (
            <MaskClip key={mask.id} mask={mask} />
          ))}
        </div>
      )}
    </div>
  );
}
