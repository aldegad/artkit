"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useTimeline, useVideoState } from "../contexts";
import { useVideoCoordinates } from "./useVideoCoordinates";
import { TimelineDragType, Clip } from "../types";
import { TIMELINE, UI } from "../constants";

interface DragState {
  type: TimelineDragType;
  clipId: string | null;
  startX: number;
  startY: number;
  startTime: number;
  originalClipStart: number;
  originalClipDuration: number;
  originalTrimIn: number;
}

const INITIAL_DRAG_STATE: DragState = {
  type: "none",
  clipId: null,
  startX: 0,
  startY: 0,
  startTime: 0,
  originalClipStart: 0,
  originalClipDuration: 0,
  originalTrimIn: 0,
};

export function useTimelineInput(tracksContainerRef: React.RefObject<HTMLDivElement | null>) {
  const {
    tracks,
    clips,
    viewState,
    moveClip,
    trimClipStart,
    trimClipEnd,
    duplicateClip,
    removeClip,
    addClips,
    saveToHistory,
    setScrollX,
  } = useTimeline();
  const { seek, selectClip, deselectAll, toolMode } = useVideoState();
  const { pixelToTime, timeToPixel, zoom } = useVideoCoordinates();

  // Snap a time value to nearby snap points (time 0 + clip edges)
  const snapToPoints = useCallback(
    (time: number, excludeClipId?: string): number => {
      if (!viewState.snapEnabled) return time;

      const threshold = TIMELINE.SNAP_THRESHOLD / zoom; // convert pixels to time
      const points: number[] = [0]; // always include time 0

      for (const clip of clips) {
        if (clip.id === excludeClipId) continue;
        points.push(clip.startTime);
        points.push(clip.startTime + clip.duration);
      }

      for (const point of points) {
        if (Math.abs(time - point) < threshold) {
          return point;
        }
      }
      return time;
    },
    [viewState.snapEnabled, zoom, clips]
  );

  const [dragState, setDragState] = useState<DragState>(INITIAL_DRAG_STATE);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const getTrackAtY = useCallback(
    (y: number): string | null => {
      if (tracks.length === 0 || y < 0) return null;

      let offset = 0;
      for (const track of tracks) {
        const start = offset;
        const end = offset + track.height;
        if (y >= start && y < end) {
          return track.id;
        }
        offset = end;
      }

      return tracks[tracks.length - 1].id;
    },
    [tracks]
  );

  // Find clip at position
  const findClipAtPosition = useCallback(
    (x: number, y: number): { clip: Clip; handle: "start" | "end" | "body" } | null => {
      const trackId = getTrackAtY(y);
      if (!trackId) return null;

      const time = pixelToTime(x);
      const trackClips = clips
        .filter((clip) => clip.trackId === trackId)
        .sort((a, b) => b.startTime - a.startTime);

      for (const clip of trackClips) {
        const clipStartX = timeToPixel(clip.startTime);
        const clipEndX = timeToPixel(clip.startTime + clip.duration);

        // Check if within clip bounds
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
    [getTrackAtY, clips, pixelToTime, timeToPixel]
  );

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const containerRect = tracksContainerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;
      const time = pixelToTime(x);

      // Middle mouse for pan
      if (e.button === 1) {
        setDragState({
          ...INITIAL_DRAG_STATE,
          type: "playhead",
          startX: x,
          startY: y,
          startTime: time,
        });
        return;
      }

      // Left click
      if (e.button === 0) {
        const result = findClipAtPosition(x, y);

        if (result) {
          const { clip, handle } = result;

          if (handle === "start" && (toolMode === "select" || toolMode === "trim")) {
            saveToHistory();
            setDragState({
              type: "clip-trim-start",
              clipId: clip.id,
              startX: x,
              startY: y,
              startTime: time,
              originalClipStart: clip.startTime,
              originalClipDuration: clip.duration,
              originalTrimIn: clip.trimIn,
            });
            selectClip(clip.id, e.shiftKey);
          } else if (handle === "end" && (toolMode === "select" || toolMode === "trim")) {
            saveToHistory();
            setDragState({
              type: "clip-trim-end",
              clipId: clip.id,
              startX: x,
              startY: y,
              startTime: time,
              originalClipStart: clip.startTime,
              originalClipDuration: clip.duration,
              originalTrimIn: clip.trimIn,
            });
            selectClip(clip.id, e.shiftKey);
          } else if (handle === "body") {
            if (toolMode === "razor") {
              // Split clip at cursor
              const splitTime = Math.max(clip.startTime, Math.min(time, clip.startTime + clip.duration));
              const splitOffset = splitTime - clip.startTime;

              // Ignore split at very edges
              if (splitOffset <= TIMELINE.CLIP_MIN_DURATION || clip.duration - splitOffset <= TIMELINE.CLIP_MIN_DURATION) {
                return;
              }

              saveToHistory();

              const firstDuration = splitOffset;
              const secondDuration = clip.duration - splitOffset;

              const firstClip: Clip = {
                ...clip,
                id: crypto.randomUUID(),
                duration: firstDuration,
                trimOut: clip.trimIn + firstDuration,
              };

              const secondClip: Clip = {
                ...clip,
                id: crypto.randomUUID(),
                name: `${clip.name} (2)`,
                startTime: splitTime,
                duration: secondDuration,
                trimIn: clip.trimIn + splitOffset,
              };

              removeClip(clip.id);
              addClips([firstClip, secondClip]);
              selectClip(secondClip.id, false);
            } else {
              saveToHistory();

              // Alt+Drag: duplicate clip and drag the copy
              let dragClipId = clip.id;
              if (e.altKey && toolMode === "select") {
                const newId = duplicateClip(clip.id, clip.trackId);
                if (newId) {
                  dragClipId = newId;
                }
              }

              setDragState({
                type: "clip-move",
                clipId: dragClipId,
                startX: x,
                startY: y,
                startTime: time,
                originalClipStart: clip.startTime,
                originalClipDuration: clip.duration,
                originalTrimIn: clip.trimIn,
              });
              selectClip(dragClipId, e.shiftKey);
            }
          }
        } else {
          // Click on empty area - seek and deselect
          const seekTime = Math.max(0, time);
          seek(seekTime);
          if (seekTime < viewState.scrollX) {
            setScrollX(seekTime);
          }
          deselectAll();
          setDragState({
            type: "playhead",
            clipId: null,
            startX: x,
            startY: y,
            startTime: time,
            originalClipStart: 0,
            originalClipDuration: 0,
            originalTrimIn: 0,
          });
        }
      }
    },
    [
      tracksContainerRef,
      pixelToTime,
      findClipAtPosition,
      toolMode,
      selectClip,
      seek,
      deselectAll,
      duplicateClip,
      removeClip,
      addClips,
      saveToHistory,
    ]
  );

  // Ref to hold the latest drag-move handler (avoids stale closures in document listener)
  const moveHandlerRef = useRef<(e: MouseEvent) => void>(() => {});
  moveHandlerRef.current = (e: MouseEvent) => {
    if (dragState.type === "none") return;
    const containerRect = tracksContainerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;
    const time = pixelToTime(x);
    const deltaTime = time - dragState.startTime;

    switch (dragState.type) {
      case "playhead": {
        const seekTime = Math.max(0, time);
        seek(seekTime);
        // Auto-scroll to keep playhead visible when seeking before visible area
        if (seekTime < viewState.scrollX) {
          setScrollX(seekTime);
        }
        break;
      }

      case "clip-move":
        if (dragState.clipId) {
          const rawStart = Math.max(0, dragState.originalClipStart + deltaTime);
          const snappedStart = snapToPoints(rawStart, dragState.clipId);
          // Also snap end edge: if end snaps, adjust start accordingly
          const rawEnd = rawStart + dragState.originalClipDuration;
          const snappedEnd = snapToPoints(rawEnd, dragState.clipId);
          const endAdjusted = Math.max(0, snappedEnd - dragState.originalClipDuration);
          // Use whichever snap is closer
          const startDelta = Math.abs(snappedStart - rawStart);
          const endDelta = Math.abs(snappedEnd - rawEnd);
          const finalStart = startDelta <= endDelta ? snappedStart : endAdjusted;
          const clip = clips.find((c) => c.id === dragState.clipId);
          if (clip) {
            const targetTrackId = getTrackAtY(y) || clip.trackId;
            moveClip(dragState.clipId, targetTrackId, finalStart);
          }
        }
        break;

      case "clip-trim-start":
        if (dragState.clipId) {
          const rawTrimStart = Math.max(0, dragState.originalClipStart + deltaTime);
          const maxStart = dragState.originalClipStart + dragState.originalClipDuration - TIMELINE.CLIP_MIN_DURATION;
          const clampedStart = Math.min(rawTrimStart, maxStart);
          trimClipStart(dragState.clipId, snapToPoints(clampedStart, dragState.clipId));
        }
        break;

      case "clip-trim-end":
        if (dragState.clipId) {
          const rawTrimEnd = dragState.originalClipStart + dragState.originalClipDuration + deltaTime;
          const minEnd = dragState.originalClipStart + TIMELINE.CLIP_MIN_DURATION;
          const clampedEnd = Math.max(rawTrimEnd, minEnd);
          trimClipEnd(dragState.clipId, snapToPoints(clampedEnd, dragState.clipId));
        }
        break;
    }
  };

  // Attach document-level listeners during drag for smooth dragging outside timeline
  useEffect(() => {
    if (dragState.type === "none") return;

    const onMouseMove = (e: MouseEvent) => moveHandlerRef.current(e);
    const onMouseUp = () => setDragState(INITIAL_DRAG_STATE);

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragState.type]);

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

      const result = findClipAtPosition(x, 0);
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
    getCursor,
    containerRef,
  };
}
