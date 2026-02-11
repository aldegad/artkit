"use client";

import { useCallback, useMemo, useRef } from "react";
import { VideoTrack, Clip as ClipType, MaskData } from "../../types";
import { Clip } from "./Clip";
import { MaskClip } from "./MaskClip";
import { cn } from "@/shared/utils/cn";
import { MASK_LANE_HEIGHT, TIMELINE, TRANSFORM_LANE_HEIGHT } from "../../constants";
import { useTimeline, useVideoState } from "../../contexts";
import { useVideoCoordinates } from "../../hooks";
import {
  getClipPositionKeyframes,
  moveClipPositionKeyframeToTimelineTime,
  removeClipPositionKeyframeById,
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

interface KeyframeDragState {
  pointerId: number;
  clipId: string;
  keyframeId: string;
  startClientX: number;
  didMove: boolean;
  historySaved: boolean;
}

const LANE_PAD_TOP = 6;
const LANE_PAD_BOTTOM = 8;
const LANE_SERIES_GAP = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapValueToBand(value: number, min: number, max: number, top: number, bottom: number): number {
  const span = max - min;
  if (span <= 0.0001) {
    return (top + bottom) / 2;
  }
  const ratio = (value - min) / span;
  return bottom - ratio * (bottom - top);
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
  const {
    playback,
    selectClip,
    seek,
    selectedPositionKeyframe,
    setSelectedPositionKeyframe,
  } = useVideoState();
  const { timeToPixel, pixelToTime } = useVideoCoordinates();

  const transformLaneRef = useRef<HTMLDivElement | null>(null);
  const keyframeDragRef = useRef<KeyframeDragState | null>(null);

  const hasMasks = masks.length > 0;
  const trackHeight = TIMELINE.TRACK_DEFAULT_HEIGHT;
  const transformLaneHeight = transformLaneOpen ? TRANSFORM_LANE_HEIGHT : 0;
  const totalHeight = trackHeight + transformLaneHeight + (hasMasks ? MASK_LANE_HEIGHT : 0);

  const visualClips = useMemo(
    () => clips.filter((clip): clip is Exclude<ClipType, { type: "audio" }> => clip.type !== "audio"),
    [clips]
  );

  const stopKeyframeDrag = useCallback((pointerId?: number) => {
    const drag = keyframeDragRef.current;
    if (!drag) return;
    if (pointerId !== undefined && drag.pointerId !== pointerId) return;

    const laneEl = transformLaneRef.current;
    if (laneEl?.hasPointerCapture(drag.pointerId)) {
      laneEl.releasePointerCapture(drag.pointerId);
    }
    keyframeDragRef.current = null;
  }, []);

  const handleTransformLanePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();

    const target = e.target as HTMLElement;
    if (target.closest("[data-transform-control='true']")) {
      return;
    }

    setSelectedPositionKeyframe(null);

    const rect = e.currentTarget.getBoundingClientRect();
    const laneX = clamp(e.clientX - rect.left, 0, rect.width);
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
  }, [pixelToTime, saveToHistory, seek, selectClip, setSelectedPositionKeyframe, updateClip, visualClips]);

  const handleTransformLanePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = keyframeDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    e.preventDefault();
    e.stopPropagation();

    if (!drag.didMove && Math.abs(e.clientX - drag.startClientX) > 2) {
      drag.didMove = true;
    }

    const laneEl = transformLaneRef.current;
    if (!laneEl) return;

    const rect = laneEl.getBoundingClientRect();
    const laneX = clamp(e.clientX - rect.left, 0, rect.width);
    const rawTimelineTime = Math.max(0, pixelToTime(laneX));

    const clip = visualClips.find((candidate) => candidate.id === drag.clipId);
    if (!clip) return;

    const timelineTime = clamp(rawTimelineTime, clip.startTime, clip.startTime + clip.duration);
    if (!drag.historySaved) {
      saveToHistory();
      drag.historySaved = true;
    }
    const result = moveClipPositionKeyframeToTimelineTime(clip, drag.keyframeId, timelineTime);
    if (!result.moved) return;

    updateClip(clip.id, result.updates);
    seek(timelineTime);
    setSelectedPositionKeyframe({
      trackId: track.id,
      clipId: clip.id,
      keyframeId: drag.keyframeId,
    });
  }, [pixelToTime, saveToHistory, seek, setSelectedPositionKeyframe, track.id, updateClip, visualClips]);

  const handleTransformLanePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    stopKeyframeDrag(e.pointerId);
  }, [stopKeyframeDrag]);

  const handleTransformLanePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    stopKeyframeDrag(e.pointerId);
  }, [stopKeyframeDrag]);

  const handleKeyframePointerDown = useCallback((
    e: React.PointerEvent<HTMLButtonElement>,
    clip: Exclude<ClipType, { type: "audio" }>,
    keyframeId: string,
    globalTime: number
  ) => {
    e.preventDefault();
    e.stopPropagation();

    selectClip(clip.id, false);
    seek(globalTime);

    if (e.altKey) {
      saveToHistory();
      const removed = removeClipPositionKeyframeById(clip, keyframeId);
      if (removed.removed) {
        updateClip(clip.id, removed.updates);
      }
      setSelectedPositionKeyframe(null);
      return;
    }

    setSelectedPositionKeyframe({
      trackId: track.id,
      clipId: clip.id,
      keyframeId,
    });

    keyframeDragRef.current = {
      pointerId: e.pointerId,
      clipId: clip.id,
      keyframeId,
      startClientX: e.clientX,
      didMove: false,
      historySaved: false,
    };

    const laneEl = transformLaneRef.current;
    laneEl?.setPointerCapture(e.pointerId);
  }, [saveToHistory, seek, selectClip, setSelectedPositionKeyframe, track.id, updateClip]);

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
          ref={transformLaneRef}
          className="relative border-t border-border-default/50 bg-surface-primary/50"
          style={{ height: TRANSFORM_LANE_HEIGHT }}
          onPointerDown={handleTransformLanePointerDown}
          onPointerMove={handleTransformLanePointerMove}
          onPointerUp={handleTransformLanePointerUp}
          onPointerCancel={handleTransformLanePointerCancel}
        >
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border-default/35 pointer-events-none" />
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: LANE_PAD_TOP }}>
            <span className="absolute left-1 text-[9px] text-cyan-300/90">X</span>
            <span className="absolute left-1 text-[9px] text-orange-300/90" style={{ top: (TRANSFORM_LANE_HEIGHT - LANE_PAD_TOP - LANE_PAD_BOTTOM) / 2 + LANE_SERIES_GAP }}>
              Y
            </span>
          </div>

          {visualClips.map((clip) => {
            const keyframes = getClipPositionKeyframes(clip);
            if (keyframes.length === 0) return null;

            const xValues = keyframes.map((keyframe) => keyframe.value.x);
            const yValues = keyframes.map((keyframe) => keyframe.value.y);
            const xMin = Math.min(...xValues);
            const xMax = Math.max(...xValues);
            const yMin = Math.min(...yValues);
            const yMax = Math.max(...yValues);

            const graphTop = LANE_PAD_TOP;
            const graphBottom = TRANSFORM_LANE_HEIGHT - LANE_PAD_BOTTOM;
            const graphHeight = graphBottom - graphTop;
            const halfHeight = (graphHeight - LANE_SERIES_GAP) / 2;
            const xBandTop = graphTop;
            const xBandBottom = graphTop + halfHeight;
            const yBandTop = xBandBottom + LANE_SERIES_GAP;
            const yBandBottom = graphBottom;
            const markerY = graphTop + graphHeight / 2;

            const points = keyframes.map((keyframe) => {
              const globalTime = clip.startTime + keyframe.time;
              return {
                keyframe,
                globalTime,
                x: timeToPixel(globalTime),
                xLineY: mapValueToBand(keyframe.value.x, xMin, xMax, xBandTop, xBandBottom),
                yLineY: mapValueToBand(keyframe.value.y, yMin, yMax, yBandTop, yBandBottom),
              };
            });

            return (
              <div key={`${clip.id}-transform-keyframes`} className="absolute inset-0 pointer-events-none">
                <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
                  {points.slice(0, -1).map((point, index) => {
                    const next = points[index + 1];
                    return (
                      <g key={`${clip.id}-seg-${point.keyframe.id}`}>
                        <line
                          x1={point.x}
                          y1={point.xLineY}
                          x2={next.x}
                          y2={next.xLineY}
                          stroke="rgb(34 211 238 / 0.75)"
                          strokeWidth={1.25}
                        />
                        <line
                          x1={point.x}
                          y1={point.yLineY}
                          x2={next.x}
                          y2={next.yLineY}
                          stroke="rgb(251 146 60 / 0.75)"
                          strokeWidth={1.25}
                        />
                      </g>
                    );
                  })}
                </svg>

                {points.map((point) => {
                  const isPlayheadKeyframe = Math.abs(point.globalTime - playback.currentTime) <= 0.02;
                  const isSelectedKeyframe =
                    selectedPositionKeyframe?.clipId === clip.id
                    && selectedPositionKeyframe.keyframeId === point.keyframe.id;

                  return (
                    <button
                      key={`${clip.id}-${point.keyframe.id}`}
                      data-transform-control="true"
                      onPointerDown={(e) => handleKeyframePointerDown(e, clip, point.keyframe.id, point.globalTime)}
                      title={`t=${point.globalTime.toFixed(2)}s, x=${Math.round(point.keyframe.value.x)}, y=${Math.round(point.keyframe.value.y)}${"\n"}Drag: move, Alt+Click: remove`}
                      className={cn(
                        "absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border pointer-events-auto",
                        isSelectedKeyframe
                          ? "bg-accent-primary border-accent-primary shadow-[0_0_0_2px_rgba(59,130,246,0.25)]"
                          : isPlayheadKeyframe
                            ? "bg-accent-primary/80 border-accent-primary"
                            : "bg-white border-black/35 hover:bg-accent-primary/75"
                      )}
                      style={{ left: point.x, top: markerY }}
                    />
                  );
                })}
              </div>
            );
          })}
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
