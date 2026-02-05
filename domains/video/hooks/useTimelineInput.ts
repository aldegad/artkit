"use client";

import { useCallback, useRef, useState } from "react";
import { useTimeline, useVideoState } from "../contexts";
import { useVideoCoordinates } from "./useVideoCoordinates";
import { TimelineDragType, Clip } from "../types";
import { TIMELINE, UI } from "../constants";

interface DragState {
  type: TimelineDragType;
  clipId: string | null;
  startX: number;
  startTime: number;
  originalClipStart: number;
  originalClipDuration: number;
  originalTrimIn: number;
}

const INITIAL_DRAG_STATE: DragState = {
  type: "none",
  clipId: null,
  startX: 0,
  startTime: 0,
  originalClipStart: 0,
  originalClipDuration: 0,
  originalTrimIn: 0,
};

export function useTimelineInput() {
  const { clips, moveClip, trimClipStart, trimClipEnd } = useTimeline();
  const { seek, selectClip, deselectAll, toolMode } = useVideoState();
  const { pixelToTime, timeToPixel } = useVideoCoordinates();

  const [dragState, setDragState] = useState<DragState>(INITIAL_DRAG_STATE);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Find clip at position
  const findClipAtPosition = useCallback(
    (x: number): { clip: Clip; handle: "start" | "end" | "body" } | null => {
      const time = pixelToTime(x);

      for (const clip of clips) {
        const clipStartX = timeToPixel(clip.startTime);
        const clipEndX = timeToPixel(clip.startTime + clip.duration);

        // Check if within clip bounds (rough y check based on track)
        if (time >= clip.startTime && time <= clip.startTime + clip.duration) {
          // Check for trim handles
          if (Math.abs(x - clipStartX) < UI.TRIM_HANDLE_WIDTH) {
            return { clip, handle: "start" };
          }
          if (Math.abs(x - clipEndX) < UI.TRIM_HANDLE_WIDTH) {
            return { clip, handle: "end" };
          }
          return { clip, handle: "body" };
        }
      }
      return null;
    },
    [clips, pixelToTime, timeToPixel]
  );

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, containerRect: DOMRect) => {
      const x = e.clientX - containerRect.left;
      const time = pixelToTime(x);

      // Middle mouse for pan
      if (e.button === 1) {
        setDragState({
          ...INITIAL_DRAG_STATE,
          type: "playhead",
          startX: x,
          startTime: time,
        });
        return;
      }

      // Left click
      if (e.button === 0) {
        const result = findClipAtPosition(x);

        if (result) {
          const { clip, handle } = result;

          if (handle === "start" && (toolMode === "select" || toolMode === "trim")) {
            setDragState({
              type: "clip-trim-start",
              clipId: clip.id,
              startX: x,
              startTime: time,
              originalClipStart: clip.startTime,
              originalClipDuration: clip.duration,
              originalTrimIn: clip.trimIn,
            });
            selectClip(clip.id, e.shiftKey);
          } else if (handle === "end" && (toolMode === "select" || toolMode === "trim")) {
            setDragState({
              type: "clip-trim-end",
              clipId: clip.id,
              startX: x,
              startTime: time,
              originalClipStart: clip.startTime,
              originalClipDuration: clip.duration,
              originalTrimIn: clip.trimIn,
            });
            selectClip(clip.id, e.shiftKey);
          } else if (handle === "body") {
            if (toolMode === "razor") {
              // Split clip at cursor
              // TODO: implement split
            } else {
              setDragState({
                type: "clip-move",
                clipId: clip.id,
                startX: x,
                startTime: time,
                originalClipStart: clip.startTime,
                originalClipDuration: clip.duration,
                originalTrimIn: clip.trimIn,
              });
              selectClip(clip.id, e.shiftKey);
            }
          }
        } else {
          // Click on empty area - seek and deselect
          seek(Math.max(0, time));
          deselectAll();
          setDragState({
            type: "playhead",
            clipId: null,
            startX: x,
            startTime: time,
            originalClipStart: 0,
            originalClipDuration: 0,
            originalTrimIn: 0,
          });
        }
      }
    },
    [pixelToTime, findClipAtPosition, toolMode, selectClip, seek, deselectAll]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent, containerRect: DOMRect) => {
      if (dragState.type === "none") return;

      const x = e.clientX - containerRect.left;
      const time = pixelToTime(x);
      const deltaTime = time - dragState.startTime;

      switch (dragState.type) {
        case "playhead":
          seek(Math.max(0, time));
          break;

        case "clip-move":
          if (dragState.clipId) {
            const newStartTime = Math.max(0, dragState.originalClipStart + deltaTime);
            const clip = clips.find((c) => c.id === dragState.clipId);
            if (clip) {
              moveClip(dragState.clipId, clip.trackId, newStartTime);
            }
          }
          break;

        case "clip-trim-start":
          if (dragState.clipId) {
            const newStartTime = Math.max(0, dragState.originalClipStart + deltaTime);
            const maxStart = dragState.originalClipStart + dragState.originalClipDuration - TIMELINE.CLIP_MIN_DURATION;
            trimClipStart(dragState.clipId, Math.min(newStartTime, maxStart));
          }
          break;

        case "clip-trim-end":
          if (dragState.clipId) {
            const newEndTime = dragState.originalClipStart + dragState.originalClipDuration + deltaTime;
            const minEnd = dragState.originalClipStart + TIMELINE.CLIP_MIN_DURATION;
            trimClipEnd(dragState.clipId, Math.max(newEndTime, minEnd));
          }
          break;
      }
    },
    [dragState, pixelToTime, clips, moveClip, trimClipStart, trimClipEnd, seek]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setDragState(INITIAL_DRAG_STATE);
  }, []);

  // Get cursor style based on position
  const getCursor = useCallback(
    (x: number): string => {
      if (dragState.type !== "none") {
        switch (dragState.type) {
          case "clip-trim-start":
          case "clip-trim-end":
            return "ew-resize";
          case "clip-move":
            return "grabbing";
          default:
            return "default";
        }
      }

      const result = findClipAtPosition(x);
      if (result) {
        if (result.handle === "start" || result.handle === "end") {
          return "ew-resize";
        }
        return "grab";
      }

      return "default";
    },
    [dragState.type, findClipAtPosition]
  );

  return {
    dragState,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    getCursor,
    containerRef,
  };
}
