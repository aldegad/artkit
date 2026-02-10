"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VideoTrack, Clip as ClipType, MaskData } from "../../types";
import { Clip } from "./Clip";
import { MaskClip } from "./MaskClip";
import { cn } from "@/shared/utils/cn";
import { MASK_LANE_HEIGHT, TIMELINE, TRANSFORM_LANE_HEIGHT } from "../../constants";
import { useTimeline, useVideoState } from "../../contexts";
import { useVideoCoordinates } from "../../hooks";
import {
  getClipPositionKeyframes,
  hasClipPositionKeyframeAtTimelineTime,
  removeClipPositionKeyframeAtTimelineTime,
  resolveClipPositionAtTimelineTime,
  upsertClipPositionKeyframeAtTimelineTime,
} from "../../utils/clipTransformKeyframes";

interface TrackProps {
  track: VideoTrack;
  clips: ClipType[];
  masks: MaskData[];
  transformLaneOpen?: boolean;
  liftedClipId?: string | null;
  isLiftDropTarget?: boolean;
  className?: string;
}

interface OffsetNumberInputProps {
  value: number;
  onCommit: (value: number) => void;
}

function OffsetNumberInput({ value, onCommit }: OffsetNumberInputProps) {
  const [draft, setDraft] = useState<string>(() => String(Math.round(value)));

  useEffect(() => {
    setDraft(String(Math.round(value)));
  }, [value]);

  const commit = useCallback(() => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(Math.round(value)));
      return;
    }
    onCommit(next);
  }, [draft, onCommit, value]);

  return (
    <input
      data-transform-control="true"
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(String(Math.round(value)));
          e.currentTarget.blur();
        }
      }}
      className="w-12 px-1 py-0.5 rounded border border-border-default bg-surface-primary text-[10px] text-text-primary focus:outline-none focus:border-accent-primary"
    />
  );
}

export function Track({
  track,
  clips,
  masks,
  transformLaneOpen = false,
  liftedClipId,
  isLiftDropTarget,
  className,
}: TrackProps) {
  const { saveToHistory, updateClip } = useTimeline();
  const { playback, selectedClipIds, selectClip, seek } = useVideoState();
  const { timeToPixel, pixelToTime } = useVideoCoordinates();

  const hasMasks = masks.length > 0;
  const trackHeight = TIMELINE.TRACK_DEFAULT_HEIGHT;
  const transformLaneHeight = transformLaneOpen ? TRANSFORM_LANE_HEIGHT : 0;
  const totalHeight = trackHeight + transformLaneHeight + (hasMasks ? MASK_LANE_HEIGHT : 0);

  const visualClips = useMemo(
    () => clips.filter((clip) => clip.type !== "audio"),
    [clips]
  );

  const selectedVisualClipInTrack = useMemo(() => {
    for (const selectedId of selectedClipIds) {
      const clip = visualClips.find((candidate) => candidate.id === selectedId);
      if (clip) return clip;
    }
    return null;
  }, [selectedClipIds, visualClips]);

  const selectedPositionAtPlayhead = useMemo(() => {
    if (!selectedVisualClipInTrack) return null;
    return resolveClipPositionAtTimelineTime(selectedVisualClipInTrack, playback.currentTime);
  }, [playback.currentTime, selectedVisualClipInTrack]);

  const hasKeyframeAtPlayhead = useMemo(() => {
    if (!selectedVisualClipInTrack) return false;
    return hasClipPositionKeyframeAtTimelineTime(selectedVisualClipInTrack, playback.currentTime);
  }, [playback.currentTime, selectedVisualClipInTrack]);

  const setSelectedClipPositionAtPlayhead = useCallback((nextPosition: { x: number; y: number }) => {
    if (!selectedVisualClipInTrack) return;
    saveToHistory();
    updateClip(
      selectedVisualClipInTrack.id,
      upsertClipPositionKeyframeAtTimelineTime(
        selectedVisualClipInTrack,
        playback.currentTime,
        nextPosition,
        { ensureInitialKeyframe: true }
      )
    );
  }, [playback.currentTime, saveToHistory, selectedVisualClipInTrack, updateClip]);

  const handleToggleKeyframeAtPlayhead = useCallback(() => {
    if (!selectedVisualClipInTrack || !selectedPositionAtPlayhead) return;

    saveToHistory();
    if (hasKeyframeAtPlayhead) {
      const result = removeClipPositionKeyframeAtTimelineTime(selectedVisualClipInTrack, playback.currentTime);
      if (result.removed) {
        updateClip(selectedVisualClipInTrack.id, result.updates);
      }
      return;
    }

    updateClip(
      selectedVisualClipInTrack.id,
      upsertClipPositionKeyframeAtTimelineTime(
        selectedVisualClipInTrack,
        playback.currentTime,
        selectedPositionAtPlayhead,
        { ensureInitialKeyframe: true }
      )
    );
  }, [hasKeyframeAtPlayhead, playback.currentTime, saveToHistory, selectedPositionAtPlayhead, selectedVisualClipInTrack, updateClip]);

  const handleTransformLanePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();

    const target = e.target as HTMLElement;
    if (target.closest("[data-transform-control='true']")) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const laneX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const timelineTime = Math.max(0, pixelToTime(laneX));

    const targetClip = visualClips.find((clip) => {
      return timelineTime >= clip.startTime && timelineTime <= clip.startTime + clip.duration;
    });

    if (!targetClip) {
      seek(timelineTime);
      return;
    }

    const position = resolveClipPositionAtTimelineTime(targetClip, timelineTime);
    saveToHistory();
    selectClip(targetClip.id, false);
    seek(timelineTime);
    updateClip(
      targetClip.id,
      upsertClipPositionKeyframeAtTimelineTime(
        targetClip,
        timelineTime,
        position,
        { ensureInitialKeyframe: true }
      )
    );
  }, [pixelToTime, saveToHistory, seek, selectClip, updateClip, visualClips]);

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
      <div className="relative" style={{ height: trackHeight }}>
        <div className={cn(
          "absolute inset-0 bg-surface-secondary/50 transition-colors",
          isLiftDropTarget && "bg-accent/10"
        )} />
        {clips.map((clip) => (
          <Clip key={clip.id} clip={clip} isLifted={liftedClipId === clip.id} />
        ))}
      </div>

      {/* Transform lane */}
      {transformLaneOpen && (
        <div
          className="relative border-t border-border-default/50 bg-surface-primary/40"
          style={{ height: TRANSFORM_LANE_HEIGHT }}
          onPointerDown={handleTransformLanePointerDown}
        >
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border-default/40 pointer-events-none" />

          {visualClips.map((clip) => {
            const keyframes = getClipPositionKeyframes(clip);
            if (keyframes.length === 0) return null;

            return (
              <div key={`${clip.id}-transform-keyframes`} className="absolute inset-0 pointer-events-none">
                {keyframes.map((keyframe, index) => {
                  const globalTime = clip.startTime + keyframe.time;
                  const x = timeToPixel(globalTime);
                  const nextKeyframe = keyframes[index + 1];
                  const nextX = nextKeyframe ? timeToPixel(clip.startTime + nextKeyframe.time) : null;

                  return (
                    <div key={`${clip.id}-${keyframe.id}`}>
                      {nextX !== null && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-px bg-accent-primary/60"
                          style={{
                            left: Math.min(x, nextX),
                            width: Math.max(1, Math.abs(nextX - x)),
                          }}
                        />
                      )}
                      <button
                        data-transform-control="true"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectClip(clip.id, false);
                          seek(globalTime);

                          if (e.altKey) {
                            saveToHistory();
                            const result = removeClipPositionKeyframeAtTimelineTime(clip, globalTime);
                            if (result.removed) {
                              updateClip(clip.id, result.updates);
                            }
                          }
                        }}
                        title={`t=${globalTime.toFixed(2)}s, x=${Math.round(keyframe.value.x)}, y=${Math.round(keyframe.value.y)}${"\n"}Alt+Click: remove`}
                        className={cn(
                          "absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border pointer-events-auto",
                          Math.abs(globalTime - playback.currentTime) <= 0.02
                            ? "bg-accent-primary border-accent-primary"
                            : "bg-white border-black/30 hover:bg-accent-primary/80"
                        )}
                        style={{ left: x }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}

          {selectedVisualClipInTrack && selectedPositionAtPlayhead && (
            <div
              data-transform-control="true"
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute left-1 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1 px-1 py-0.5 rounded border border-border-default/70 bg-surface-primary/90 shadow-sm"
            >
              <button
                data-transform-control="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleKeyframeAtPlayhead();
                }}
                title={hasKeyframeAtPlayhead ? "Remove keyframe at playhead" : "Add keyframe at playhead"}
                className={cn(
                  "w-3 h-3 rotate-45 border",
                  hasKeyframeAtPlayhead
                    ? "bg-accent-primary border-accent-primary"
                    : "border-border-default hover:border-accent-primary"
                )}
              />
              <span className="text-[10px] text-text-tertiary">X</span>
              <OffsetNumberInput
                value={selectedPositionAtPlayhead.x}
                onCommit={(x) => setSelectedClipPositionAtPlayhead({
                  x,
                  y: selectedPositionAtPlayhead.y,
                })}
              />
              <span className="text-[10px] text-text-tertiary">Y</span>
              <OffsetNumberInput
                value={selectedPositionAtPlayhead.y}
                onCommit={(y) => setSelectedClipPositionAtPlayhead({
                  x: selectedPositionAtPlayhead.x,
                  y,
                })}
              />
            </div>
          )}
        </div>
      )}

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
