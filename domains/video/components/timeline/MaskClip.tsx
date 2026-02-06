"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { MaskData } from "../../types";
import { useVideoCoordinates } from "../../hooks";
import { useMask } from "../../contexts";
import { useVideoState } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { UI } from "../../constants";

type DragMode = "none" | "move" | "trim-start" | "trim-end";

interface MaskClipProps {
  mask: MaskData;
}

export function MaskClip({ mask }: MaskClipProps) {
  const { timeToPixel, durationToWidth } = useVideoCoordinates();
  const { activeMaskId, startMaskEditById, updateMaskTime } = useMask();
  const { playback } = useVideoState();

  const isActive = activeMaskId === mask.id;
  const x = timeToPixel(mask.startTime);
  const width = Math.max(durationToWidth(mask.duration), 20);

  const [dragMode, setDragMode] = useState<DragMode>("none");
  const dragRef = useRef({
    startClientX: 0,
    originalStart: 0,
    originalDuration: 0,
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    startMaskEditById(mask.id, playback.currentTime);

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
  }, [startMaskEditById, mask.id, mask.startTime, mask.duration, playback.currentTime]);

  useEffect(() => {
    if (dragMode === "none") return;

    const { originalStart, originalDuration, startClientX } = dragRef.current;

    const onMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startClientX;
      // Convert pixel delta to time delta using current zoom
      const deltaTime = deltaX / durationToWidth(1);

      if (dragMode === "move") {
        const newStart = Math.max(0, originalStart + deltaTime);
        updateMaskTime(mask.id, newStart, originalDuration);
      } else if (dragMode === "trim-start") {
        const newStart = Math.max(0, originalStart + deltaTime);
        const maxStart = originalStart + originalDuration - 0.1;
        const clampedStart = Math.min(newStart, maxStart);
        const newDuration = originalDuration - (clampedStart - originalStart);
        updateMaskTime(mask.id, clampedStart, newDuration);
      } else if (dragMode === "trim-end") {
        const newDuration = Math.max(0.1, originalDuration + deltaTime);
        updateMaskTime(mask.id, originalStart, newDuration);
      }
    };

    const onMouseUp = () => setDragMode("none");

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragMode, mask.id, updateMaskTime, durationToWidth]);

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
        isActive && "ring-1 ring-purple-300 bg-purple-500/80"
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
