"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { MaskData } from "../../types";
import { useVideoCoordinates } from "../../hooks";
import { useMask, useTimeline } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { UI, TIMELINE } from "../../constants";

type DragMode = "none" | "move" | "trim-start" | "trim-end";

interface MaskClipProps {
  mask: MaskData;
}

export function MaskClip({ mask }: MaskClipProps) {
  const { timeToPixel, durationToWidth, zoom } = useVideoCoordinates();
  const { activeMaskId, startMaskEditById, endMaskEdit, updateMaskTime } = useMask();
  const { tracks, clips, viewState } = useTimeline();

  const isActive = activeMaskId === mask.id;
  const x = timeToPixel(mask.startTime);
  const width = Math.max(durationToWidth(mask.duration), 20);

  const [dragMode, setDragMode] = useState<DragMode>("none");
  const dragRef = useRef({
    startClientX: 0,
    originalStart: 0,
    originalDuration: 0,
  });
  const didDragRef = useRef(false);

  // Snap to own track clips + adjacent track below clips
  const snapToPoints = useCallback(
    (time: number): number => {
      if (!viewState.snapEnabled) return time;

      const threshold = TIMELINE.SNAP_THRESHOLD / zoom;
      const points: number[] = [0];

      // Find adjacent track below (next in tracks array)
      const trackIndex = tracks.findIndex((t) => t.id === mask.trackId);
      const adjacentTrackIds = [mask.trackId];
      if (trackIndex >= 0 && trackIndex + 1 < tracks.length) {
        adjacentTrackIds.push(tracks[trackIndex + 1].id);
      }

      for (const clip of clips) {
        if (!adjacentTrackIds.includes(clip.trackId)) continue;
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
    [viewState.snapEnabled, zoom, clips, tracks, mask.trackId]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    didDragRef.current = false;

    // Select or deselect on click (deselect handled in mouseUp if no drag)
    if (!isActive) {
      startMaskEditById(mask.id);
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;

    let mode: DragMode = "move";
    if (localX < UI.TRIM_HANDLE_WIDTH) {
      mode = "trim-start";
    } else if (localX > rect.width - UI.TRIM_HANDLE_WIDTH) {
      mode = "trim-end";
    }

    dragRef.current = {
      startClientX: e.clientX,
      originalStart: mask.startTime,
      originalDuration: mask.duration,
    };
    setDragMode(mode);
  }, [startMaskEditById, endMaskEdit, isActive, mask.id, mask.startTime, mask.duration]);

  useEffect(() => {
    if (dragMode === "none") return;

    const { originalStart, originalDuration, startClientX } = dragRef.current;

    const onMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startClientX;
      if (Math.abs(deltaX) > 2) didDragRef.current = true;
      // Convert pixel delta to time delta using current zoom
      const deltaTime = deltaX / durationToWidth(1);

      if (dragMode === "move") {
        const rawStart = Math.max(0, originalStart + deltaTime);
        const rawEnd = rawStart + originalDuration;
        const snappedStart = snapToPoints(rawStart);
        const snappedEnd = snapToPoints(rawEnd);
        const startDelta = Math.abs(snappedStart - rawStart);
        const endDelta = Math.abs(snappedEnd - rawEnd);
        const finalStart = startDelta <= endDelta ? snappedStart : Math.max(0, snappedEnd - originalDuration);
        updateMaskTime(mask.id, finalStart, originalDuration);
      } else if (dragMode === "trim-start") {
        const rawStart = Math.max(0, originalStart + deltaTime);
        const maxStart = originalStart + originalDuration - 0.1;
        const snappedStart = snapToPoints(rawStart);
        const clampedStart = Math.min(snappedStart, maxStart);
        const newDuration = originalDuration - (clampedStart - originalStart);
        updateMaskTime(mask.id, clampedStart, newDuration);
      } else if (dragMode === "trim-end") {
        const rawEnd = originalStart + Math.max(0.1, originalDuration + deltaTime);
        const snappedEnd = snapToPoints(rawEnd);
        const newDuration = Math.max(0.1, snappedEnd - originalStart);
        updateMaskTime(mask.id, originalStart, newDuration);
      }
    };

    const onMouseUp = () => {
      // Deselect if it was already active and user just clicked (no drag)
      if (isActive && !didDragRef.current) {
        endMaskEdit();
      }
      setDragMode("none");
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragMode, mask.id, isActive, updateMaskTime, endMaskEdit, durationToWidth, snapToPoints]);

  // Cursor based on hover position
  const handleMouseMoveLocal = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const el = e.currentTarget as HTMLElement;
    if (localX < UI.TRIM_HANDLE_WIDTH || localX > rect.width - UI.TRIM_HANDLE_WIDTH) {
      el.style.cursor = "ew-resize";
    } else {
      el.style.cursor = dragMode === "move" ? "grabbing" : "grab";
    }
  }, [dragMode]);

  return (
    <div
      className={cn(
        "absolute top-0.5 bottom-0.5 rounded",
        "bg-purple-600/70 hover:bg-purple-500/70",
        isActive && "ring-2 ring-clip-selection-ring ring-offset-1 ring-offset-transparent"
      )}
      style={{
        left: x,
        width,
        cursor: dragMode !== "none" ? (dragMode === "move" ? "grabbing" : "ew-resize") : "grab",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMoveLocal}
    >
      <div className="px-1.5 py-0.5 text-[10px] text-white/80 truncate leading-tight select-none">
        Mask
      </div>
    </div>
  );
}
