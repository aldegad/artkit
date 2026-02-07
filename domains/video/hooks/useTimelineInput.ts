"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useTimeline, useVideoState, useMask } from "../contexts";
import { useVideoCoordinates } from "./useVideoCoordinates";
import { TimelineDragType, Clip } from "../types";
import { TIMELINE, UI, MASK_LANE_HEIGHT } from "../constants";

interface DragItem {
  type: "clip" | "mask";
  id: string;
  originalStartTime: number;
}

interface DragState {
  type: TimelineDragType;
  clipId: string | null;
  items: DragItem[];
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
  items: [],
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
  const {
    seek,
    selectClip,
    selectClips,
    selectMasksForTimeline,
    deselectAll,
    toolMode,
    selectedClipIds,
    selectedMaskIds,
  } = useVideoState();
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

  const { getMasksForTrack, duplicateMask, updateMaskTime, masks } = useMask();

  const getTrackAtY = useCallback(
    (y: number): { trackId: string | null; inMaskLane: boolean } => {
      if (tracks.length === 0 || y < 0) return { trackId: null, inMaskLane: false };

      let offset = 0;
      for (const track of tracks) {
        const hasMasks = getMasksForTrack(track.id).length > 0;
        const clipEnd = offset + track.height;
        const trackEnd = clipEnd + (hasMasks ? MASK_LANE_HEIGHT : 0);

        if (y >= offset && y < trackEnd) {
          if (y >= clipEnd && hasMasks) {
            return { trackId: track.id, inMaskLane: true };
          }
          return { trackId: track.id, inMaskLane: false };
        }
        offset = trackEnd;
      }

      return { trackId: tracks[tracks.length - 1].id, inMaskLane: false };
    },
    [tracks, getMasksForTrack]
  );

  // Find clip at position (returns null for mask lane clicks)
  const findClipAtPosition = useCallback(
    (x: number, y: number): { clip: Clip; handle: "start" | "end" | "body" } | null => {
      const { trackId, inMaskLane } = getTrackAtY(y);
      if (!trackId || inMaskLane) return null;

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

  // Build drag items from selected clips and masks
  const buildDragItems = useCallback(
    (activeClipIds: string[], activeMaskIds: string[]): DragItem[] => {
      const items: DragItem[] = [];
      for (const cid of activeClipIds) {
        const c = clips.find((cl) => cl.id === cid);
        if (c) items.push({ type: "clip", id: cid, originalStartTime: c.startTime });
      }
      for (const mid of activeMaskIds) {
        const m = masks.get(mid);
        if (m) items.push({ type: "mask", id: mid, originalStartTime: m.startTime });
      }
      return items;
    },
    [clips, masks]
  );

  // Handle pointer down (supports mouse, touch, pen)
  // Matches ResizeHandle pattern: preventDefault + setPointerCapture for reliable touch
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const containerRect = tracksContainerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

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
        // Check if click is in a mask lane - let MaskClip handle it
        const { inMaskLane } = getTrackAtY(y);
        if (inMaskLane) return;

        const result = findClipAtPosition(x, y);

        if (result) {
          const { clip, handle } = result;

          if (handle === "start" && (toolMode === "select" || toolMode === "trim")) {
            saveToHistory();
            setDragState({
              type: "clip-trim-start",
              clipId: clip.id,
              items: [],
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
              items: [],
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

              const isAlreadySelected = selectedClipIds.includes(clip.id);

              // Determine effective selection after this click
              let activeClipIds: string[];
              let activeMaskIds: string[];

              if (isAlreadySelected) {
                // Already selected — preserve current multi-selection
                activeClipIds = selectedClipIds;
                activeMaskIds = selectedMaskIds;
              } else if (e.shiftKey) {
                // Shift+click — add to selection
                activeClipIds = [...selectedClipIds, clip.id];
                activeMaskIds = selectedMaskIds;
                selectClip(clip.id, true);
              } else {
                // Plain click — single select
                activeClipIds = [clip.id];
                activeMaskIds = [];
                selectClip(clip.id, false);
              }

              let primaryClipId = clip.id;

              if (e.altKey && toolMode === "select") {
                // Alt+Drag: duplicate ALL selected items and drag the copies
                const newClipIds: string[] = [];
                const newMaskIds: string[] = [];

                for (const cid of activeClipIds) {
                  const c = clips.find((cl) => cl.id === cid);
                  const newId = duplicateClip(cid, c?.trackId);
                  if (newId) newClipIds.push(newId);
                }

                for (const mid of activeMaskIds) {
                  const newId = duplicateMask(mid);
                  if (newId) newMaskIds.push(newId);
                }

                // Map original primary to new primary
                const primaryIndex = activeClipIds.indexOf(clip.id);
                primaryClipId = primaryIndex >= 0 && primaryIndex < newClipIds.length
                  ? newClipIds[primaryIndex]
                  : newClipIds[0] || clip.id;

                // Select duplicated items
                if (newClipIds.length > 0) selectClips(newClipIds);
                if (newMaskIds.length > 0) selectMasksForTimeline(newMaskIds);

                // Build items from originals' positions (duplicates start at same position)
                const items: DragItem[] = [];
                for (let i = 0; i < newClipIds.length; i++) {
                  const origClip = clips.find((c) => c.id === activeClipIds[i]);
                  if (origClip) {
                    items.push({ type: "clip", id: newClipIds[i], originalStartTime: origClip.startTime });
                  }
                }
                for (let i = 0; i < newMaskIds.length; i++) {
                  const origMask = masks.get(activeMaskIds[i]);
                  if (origMask) {
                    items.push({ type: "mask", id: newMaskIds[i], originalStartTime: origMask.startTime });
                  }
                }

                setDragState({
                  type: "clip-move",
                  clipId: primaryClipId,
                  items,
                  startX: x,
                  startY: y,
                  startTime: time,
                  originalClipStart: clip.startTime,
                  originalClipDuration: clip.duration,
                  originalTrimIn: clip.trimIn,
                });
              } else {
                // Normal drag: move all selected items
                const items = buildDragItems(activeClipIds, activeMaskIds);

                setDragState({
                  type: "clip-move",
                  clipId: primaryClipId,
                  items,
                  startX: x,
                  startY: y,
                  startTime: time,
                  originalClipStart: clip.startTime,
                  originalClipDuration: clip.duration,
                  originalTrimIn: clip.trimIn,
                });
              }
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
            items: [],
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
      selectClips,
      selectMasksForTimeline,
      selectedClipIds,
      selectedMaskIds,
      seek,
      deselectAll,
      duplicateClip,
      duplicateMask,
      removeClip,
      addClips,
      saveToHistory,
      clips,
      masks,
      buildDragItems,
    ]
  );

  // Ref to hold the latest drag-move handler (avoids stale closures in document listener)
  const moveHandlerRef = useRef<(e: PointerEvent) => void>(() => {});
  moveHandlerRef.current = (e: PointerEvent) => {
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

      case "clip-move": {
        if (!dragState.clipId || dragState.items.length === 0) break;

        // Calculate snap based on primary clip
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

        // Time delta from primary clip's original position
        const timeDelta = finalStart - dragState.originalClipStart;

        // Move all items by the same time delta
        for (const item of dragState.items) {
          const newStartTime = Math.max(0, item.originalStartTime + timeDelta);
          if (item.type === "clip") {
            const c = clips.find((cl) => cl.id === item.id);
            if (c) {
              // Only primary clip changes track; others stay on their tracks
              const targetTrackId = item.id === dragState.clipId
                ? (getTrackAtY(y).trackId || c.trackId)
                : c.trackId;
              moveClip(item.id, targetTrackId, newStartTime);
            }
          } else if (item.type === "mask") {
            const m = masks.get(item.id);
            if (m) {
              updateMaskTime(item.id, newStartTime, m.duration);
            }
          }
        }
        break;
      }

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

    const onPointerMove = (e: PointerEvent) => moveHandlerRef.current(e);
    const onPointerUp = () => setDragState(INITIAL_DRAG_STATE);

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
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
    handlePointerDown,
    getCursor,
    containerRef,
  };
}
