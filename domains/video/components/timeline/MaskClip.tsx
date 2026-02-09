"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { MaskData } from "../../types";
import { useVideoCoordinates } from "../../hooks";
import { useMask, useTimeline, useVideoState } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { safeSetPointerCapture } from "@/shared/utils";
import { useDeferredPointerGesture } from "@/shared/hooks";
import { UI, TIMELINE } from "../../constants";

/** Long-press duration (ms) to enter mask edit mode */
const LONG_PRESS_MS = 400;

type DragMode = "none" | "move" | "trim-start" | "trim-end";

interface DragItem {
  type: "clip" | "mask";
  id: string;
  originalStartTime: number;
}

interface MaskMovePendingState {
  pointerId: number;
  clientX: number;
  clientY: number;
}

interface MaskDragPendingState {
  pointerId: number;
  clientX: number;
  clientY: number;
  mode: Exclude<DragMode, "none">;
  originalStart: number;
  originalDuration: number;
  otherItems: DragItem[];
}

interface MaskClipProps {
  mask: MaskData;
}

export function MaskClip({ mask }: MaskClipProps) {
  const { timeToPixel, durationToWidth, zoom } = useVideoCoordinates();
  const {
    activeMaskId,
    isEditingMask,
    selectMask,
    deselectMask,
    startMaskEditById,
    endMaskEdit,
    updateMaskTime,
    duplicateMask,
    masks,
  } = useMask();
  const { tracks, clips, viewState, moveClip, saveToHistory } = useTimeline();
  const {
    toolMode,
    selectedMaskIds,
    selectedClipIds,
    selectMaskForTimeline,
    selectMasksForTimeline,
    deselectAll: deselectAllState,
  } = useVideoState();

  const isActive = activeMaskId === mask.id;
  const isEditing = isActive && isEditingMask;
  const isTimelineSelected = selectedMaskIds.includes(mask.id);
  const showSelectionRing = isActive || isTimelineSelected;
  const x = timeToPixel(mask.startTime);
  const width = Math.max(durationToWidth(mask.duration), 20);

  const [dragMode, setDragMode] = useState<DragMode>("none");
  const [dragPending, setDragPending] = useState<MaskDragPendingState | null>(null);
  const didDragRef = useRef(false);
  const wasActiveOnDownRef = useRef(false);
  const wasEditingOnDownRef = useRef(false);
  const wasTimelineSelectedOnDownRef = useRef(false);
  const shiftKeyOnDownRef = useRef(false);
  const [movePending, setMovePending] = useState<MaskMovePendingState | null>(null);

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

  const splitMaskAtPosition = useCallback((localX: number, widthPx: number) => {
    if (widthPx <= 0) return;
    const ratio = Math.max(0, Math.min(1, localX / widthPx));
    const splitTime = mask.startTime + mask.duration * ratio;
    const splitOffset = splitTime - mask.startTime;
    const remainDuration = mask.duration - splitOffset;

    if (
      splitOffset <= TIMELINE.CLIP_MIN_DURATION ||
      remainDuration <= TIMELINE.CLIP_MIN_DURATION
    ) {
      return;
    }

    saveToHistory();
    const secondMaskId = duplicateMask(mask.id);
    if (!secondMaskId) return;

    updateMaskTime(mask.id, mask.startTime, splitOffset);
    updateMaskTime(secondMaskId, splitTime, remainDuration);
    selectMaskForTimeline(secondMaskId, false);
    selectMask(secondMaskId);
  }, [
    mask.id,
    mask.startTime,
    mask.duration,
    saveToHistory,
    duplicateMask,
    updateMaskTime,
    selectMaskForTimeline,
    selectMask,
  ]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    safeSetPointerCapture(target, e.pointerId);
    didDragRef.current = false;
    wasActiveOnDownRef.current = isActive;
    wasEditingOnDownRef.current = isEditing;
    wasTimelineSelectedOnDownRef.current = isTimelineSelected;
    shiftKeyOnDownRef.current = e.shiftKey;

    const rect = target.getBoundingClientRect();
    const localX = e.clientX - rect.left;

    if (toolMode === "razor") {
      splitMaskAtPosition(localX, rect.width);
      return;
    }

    // Timeline selection for multi-select
    const isAlreadySelected = isTimelineSelected;

    if (isAlreadySelected) {
      // Already in selection — preserve multi-selection
    } else if (e.shiftKey) {
      // Shift+click — add to existing selection
      selectMaskForTimeline(mask.id, true);
    } else {
      // Single click — select only this mask
      deselectAllState();
      selectMaskForTimeline(mask.id, false);
    }

    // Also set MaskContext active for visual feedback
    if (!isActive) {
      selectMask(mask.id);
    }

    let mode: DragMode = "move";
    if (localX < UI.TRIM_HANDLE_WIDTH) {
      mode = "trim-start";
    } else if (localX > rect.width - UI.TRIM_HANDLE_WIDTH) {
      mode = "trim-end";
    }

    // Build drag items for multi-drag (only for move mode)
    let otherItems: DragItem[] = [];
    if (mode === "move") {
      const effectiveClipIds = isAlreadySelected ? selectedClipIds : (e.shiftKey ? selectedClipIds : []);
      const effectiveMaskIds = isAlreadySelected ? selectedMaskIds : (e.shiftKey ? [...selectedMaskIds, mask.id] : [mask.id]);
      const items: DragItem[] = [];
      for (const cid of effectiveClipIds) {
        const c = clips.find((cl) => cl.id === cid);
        if (c) items.push({ type: "clip", id: cid, originalStartTime: c.startTime });
      }
      for (const mid of effectiveMaskIds) {
        if (mid === mask.id) continue; // this mask handled separately
        const m = masks.get(mid);
        if (m) items.push({ type: "mask", id: mid, originalStartTime: m.startTime });
      }
      otherItems = items;
    }

    setDragPending({
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      mode,
      originalStart: mask.startTime,
      originalDuration: mask.duration,
      otherItems,
    });

    if (mode === "move") {
      setMovePending({
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
      });
    } else {
      setMovePending(null);
    }

    setDragMode(mode);
  }, [toolMode, splitMaskAtPosition, selectMask, selectMaskForTimeline, deselectAllState, isActive, isEditing, isTimelineSelected,
      mask.id, mask.startTime, mask.duration, selectedClipIds, selectedMaskIds, clips, masks, startMaskEditById]);

  useDeferredPointerGesture<MaskMovePendingState>({
    pending: movePending,
    thresholdPx: 2,
    longPressMs: LONG_PRESS_MS,
    onResolve: () => {
      didDragRef.current = true;
    },
    onLongPress: () => {
      // Long-press should enter edit mode, not trigger click-toggle behavior on release.
      didDragRef.current = true;
      startMaskEditById(mask.id);
      setDragMode("none");
      setDragPending(null);
    },
    onEnd: () => {
      setMovePending(null);
    },
  });

  useDeferredPointerGesture<MaskDragPendingState>({
    pending: dragPending,
    thresholdPx: 0,
    onMoveResolved: ({ pending, event }) => {
      const deltaX = event.clientX - pending.clientX;
      if (Math.abs(deltaX) > 2) {
        didDragRef.current = true;
      }
      const deltaTime = deltaX / durationToWidth(1);

      if (pending.mode === "move") {
        const rawStart = Math.max(0, pending.originalStart + deltaTime);
        const rawEnd = rawStart + pending.originalDuration;
        const snappedStart = snapToPoints(rawStart);
        const snappedEnd = snapToPoints(rawEnd);
        const startDelta = Math.abs(snappedStart - rawStart);
        const endDelta = Math.abs(snappedEnd - rawEnd);
        const finalStart = startDelta <= endDelta
          ? snappedStart
          : Math.max(0, snappedEnd - pending.originalDuration);
        updateMaskTime(mask.id, finalStart, pending.originalDuration);

        // Move other selected items by the same time delta.
        const timeDelta = finalStart - pending.originalStart;
        for (const item of pending.otherItems) {
          const newStartTime = Math.max(0, item.originalStartTime + timeDelta);
          if (item.type === "clip") {
            const c = clips.find((cl) => cl.id === item.id);
            if (c) moveClip(item.id, c.trackId, newStartTime);
          } else if (item.type === "mask") {
            const m = masks.get(item.id);
            if (m) updateMaskTime(item.id, newStartTime, m.duration);
          }
        }
      } else if (pending.mode === "trim-start") {
        const rawStart = Math.max(0, pending.originalStart + deltaTime);
        const maxStart = pending.originalStart + pending.originalDuration - 0.1;
        const snappedStart = snapToPoints(rawStart);
        const clampedStart = Math.min(snappedStart, maxStart);
        const newDuration = pending.originalDuration - (clampedStart - pending.originalStart);
        updateMaskTime(mask.id, clampedStart, newDuration);
      } else if (pending.mode === "trim-end") {
        const rawEnd = pending.originalStart + Math.max(0.1, pending.originalDuration + deltaTime);
        const snappedEnd = snapToPoints(rawEnd);
        const newDuration = Math.max(0.1, snappedEnd - pending.originalStart);
        updateMaskTime(mask.id, pending.originalStart, newDuration);
      }
    },
    onEnd: () => {
      if (!didDragRef.current) {
        if (wasEditingOnDownRef.current) {
          // Was editing -> click exits edit mode (stays selected).
          endMaskEdit();
        } else if (wasTimelineSelectedOnDownRef.current) {
          // Was already selected -> toggle deselect.
          if (shiftKeyOnDownRef.current) {
            const remaining = selectedMaskIds.filter((id) => id !== mask.id);
            selectMasksForTimeline(remaining);
          } else {
            deselectAllState();
          }
          deselectMask();
        }
      }
      setDragPending(null);
      setDragMode("none");
    },
  });

  // Cursor based on hover position
  const handlePointerMoveLocal = useCallback((e: React.PointerEvent) => {
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
        isEditing
          ? "bg-purple-500/80 hover:bg-purple-400/80"
          : "bg-purple-600/70 hover:bg-purple-500/70",
        showSelectionRing && "ring-2 ring-clip-selection-ring ring-offset-1 ring-offset-transparent"
      )}
      style={{
        left: x,
        width,
        cursor: dragMode !== "none" ? (dragMode === "move" ? "grabbing" : "ew-resize") : "grab",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMoveLocal}
    >
      <div className="px-1.5 py-0.5 text-[10px] text-white/80 truncate leading-tight select-none">
        {isEditing ? "Editing" : "Mask"}
      </div>
    </div>
  );
}
