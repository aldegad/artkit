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

/** Long-press duration (ms) before a clip is "lifted" for cross-track movement on touch */
const LONG_PRESS_MS = 400;

/** Minimum movement (px) before we resolve a touch gesture as scroll or drag */
const TOUCH_GESTURE_THRESHOLD = 8;

// ── Touch pending state ───────────────────────────────────────────────
interface TouchPendingState {
  pointerId: number;
  clientX: number;
  clientY: number;
  x: number; // relative to container
  contentY: number; // in content coords (with scroll offset)
  time: number;
  clipResult: { clip: Clip; handle: "start" | "end" | "body" } | null;
}

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

  // Long-press lift state for cross-track touch movement
  const [liftedClipId, setLiftedClipId] = useState<string | null>(null);
  const isLiftedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Touch pending state: deferred gesture resolution
  const [touchPending, setTouchPending] = useState<TouchPendingState | null>(null);

  const { getMasksForTrack, duplicateMask, updateMaskTime, masks } = useMask();

  /** Get Y in content coordinates (accounts for scroll offset) */
  const getContentY = useCallback(
    (clientY: number): number => {
      const rect = tracksContainerRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return clientY - rect.top + (tracksContainerRef.current?.scrollTop ?? 0);
    },
    [tracksContainerRef]
  );

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
    (x: number, contentY: number): { clip: Clip; handle: "start" | "end" | "body" } | null => {
      const { trackId, inMaskLane } = getTrackAtY(contentY);
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

  /** Cancel any pending long-press timer */
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  /** Reset lift state */
  const resetLift = useCallback(() => {
    cancelLongPress();
    isLiftedRef.current = false;
    setLiftedClipId(null);
  }, [cancelLongPress]);

  // ── Start a drag from resolved touch gesture (horizontal movement) ──
  const startDragFromTouch = useCallback(
    (pending: TouchPendingState) => {
      if (pending.clipResult) {
        const { clip, handle } = pending.clipResult;

        if (handle === "body" && toolMode === "razor") {
          const splitTime = Math.max(clip.startTime, Math.min(pending.time, clip.startTime + clip.duration));
          const splitOffset = splitTime - clip.startTime;
          if (splitOffset <= TIMELINE.CLIP_MIN_DURATION || clip.duration - splitOffset <= TIMELINE.CLIP_MIN_DURATION) {
            return;
          }
          saveToHistory();
          const firstClip: Clip = { ...clip, id: crypto.randomUUID(), duration: splitOffset, trimOut: clip.trimIn + splitOffset };
          const secondClip: Clip = { ...clip, id: crypto.randomUUID(), name: `${clip.name} (2)`, startTime: splitTime, duration: clip.duration - splitOffset, trimIn: clip.trimIn + splitOffset };
          removeClip(clip.id);
          addClips([firstClip, secondClip]);
          selectClip(secondClip.id, false);
          return;
        }

        if (handle === "start" && (toolMode === "select" || toolMode === "trim")) {
          saveToHistory();
          selectClip(clip.id, false);
          setDragState({ type: "clip-trim-start", clipId: clip.id, items: [], startX: pending.x, startY: pending.contentY, startTime: pending.time, originalClipStart: clip.startTime, originalClipDuration: clip.duration, originalTrimIn: clip.trimIn });
          return;
        }

        if (handle === "end" && (toolMode === "select" || toolMode === "trim")) {
          saveToHistory();
          selectClip(clip.id, false);
          setDragState({ type: "clip-trim-end", clipId: clip.id, items: [], startX: pending.x, startY: pending.contentY, startTime: pending.time, originalClipStart: clip.startTime, originalClipDuration: clip.duration, originalTrimIn: clip.trimIn });
          return;
        }

        if (handle === "body") {
          saveToHistory();
          selectClip(clip.id, false);
          const items = buildDragItems([clip.id], []);

          // Touch: needs long-press to lift for cross-track
          isLiftedRef.current = false;
          longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null;
            isLiftedRef.current = true;
            setLiftedClipId(clip.id);
            if (navigator.vibrate) navigator.vibrate(30);
          }, LONG_PRESS_MS);

          setDragState({ type: "clip-move", clipId: clip.id, items, startX: pending.x, startY: pending.contentY, startTime: pending.time, originalClipStart: clip.startTime, originalClipDuration: clip.duration, originalTrimIn: clip.trimIn });
        }
      } else {
        // Empty area → playhead drag (horizontal seek)
        const seekTime = Math.max(0, pending.time);
        seek(seekTime);
        deselectAll();
        setDragState({ type: "playhead", clipId: null, items: [], startX: pending.x, startY: pending.contentY, startTime: pending.time, originalClipStart: 0, originalClipDuration: 0, originalTrimIn: 0 });
      }
    },
    [toolMode, selectClip, saveToHistory, buildDragItems, seek, deselectAll, removeClip, addClips]
  );

  // ── Handle a touch tap (pointerup without significant movement) ──
  const handleTouchTap = useCallback(
    (pending: TouchPendingState) => {
      if (pending.clipResult) {
        selectClip(pending.clipResult.clip.id, false);
      } else {
        const seekTime = Math.max(0, pending.time);
        seek(seekTime);
        if (seekTime < viewState.scrollX) {
          setScrollX(seekTime);
        }
        deselectAll();
      }
    },
    [selectClip, seek, viewState.scrollX, setScrollX, deselectAll]
  );

  // ── Touch gesture resolution effect ──
  // When touchPending is set, listen for movement to determine: scroll / drag / tap
  useEffect(() => {
    if (!touchPending) return;

    let lastClientY = touchPending.clientY;
    let resolved = false; // true once we determined scroll vs drag
    let isScrolling = false;

    const handleMove = (e: PointerEvent) => {
      if (e.pointerId !== touchPending.pointerId) return;

      if (!resolved) {
        const dx = Math.abs(e.clientX - touchPending.clientX);
        const dy = Math.abs(e.clientY - touchPending.clientY);

        if (dx >= TOUCH_GESTURE_THRESHOLD || dy >= TOUCH_GESTURE_THRESHOLD) {
          resolved = true;

          if (dy >= dx) {
            // Vertical → scroll mode
            isScrolling = true;
          } else {
            // Horizontal → drag mode
            isScrolling = false;
            startDragFromTouch(touchPending);
            setTouchPending(null);
            return;
          }
        }
      }

      // Scroll mode: manually scroll the container
      if (isScrolling) {
        const deltaY = lastClientY - e.clientY;
        if (tracksContainerRef.current) {
          tracksContainerRef.current.scrollTop += deltaY;
        }
        lastClientY = e.clientY;
      }
    };

    const handleUp = (e: PointerEvent) => {
      if (e.pointerId !== touchPending.pointerId) return;

      if (!resolved) {
        // No significant movement → tap
        handleTouchTap(touchPending);
      }

      setTouchPending(null);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleUp);

    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleUp);
    };
  }, [touchPending, startDragFromTouch, handleTouchTap, tracksContainerRef]);

  // Handle pointer down (supports mouse, touch, pen)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const containerRect = tracksContainerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const x = e.clientX - containerRect.left;
      const contentY = getContentY(e.clientY);
      const time = pixelToTime(x);

      // ── Touch: defer ALL processing until gesture direction is known ──
      if (e.pointerType === "touch" && e.button === 0) {
        const { inMaskLane } = getTrackAtY(contentY);
        if (inMaskLane) return; // Let MaskClip handle it

        const clipResult = findClipAtPosition(x, contentY);
        setTouchPending({
          pointerId: e.pointerId,
          clientX: e.clientX,
          clientY: e.clientY,
          x,
          contentY,
          time,
          clipResult,
        });
        return;
      }

      // ── Mouse/Pen: process immediately ──
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      // Middle mouse for pan
      if (e.button === 1) {
        setDragState({
          ...INITIAL_DRAG_STATE,
          type: "playhead",
          startX: x,
          startY: contentY,
          startTime: time,
        });
        return;
      }

      // Left click
      if (e.button === 0) {
        // Check if click is in a mask lane - let MaskClip handle it
        const { inMaskLane } = getTrackAtY(contentY);
        if (inMaskLane) return;

        const result = findClipAtPosition(x, contentY);

        if (result) {
          const { clip, handle } = result;

          if (handle === "start" && (toolMode === "select" || toolMode === "trim")) {
            saveToHistory();
            setDragState({
              type: "clip-trim-start",
              clipId: clip.id,
              items: [],
              startX: x,
              startY: contentY,
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
              startY: contentY,
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
                activeClipIds = selectedClipIds;
                activeMaskIds = selectedMaskIds;
              } else if (e.shiftKey) {
                activeClipIds = [...selectedClipIds, clip.id];
                activeMaskIds = selectedMaskIds;
                selectClip(clip.id, true);
              } else {
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

                const primaryIndex = activeClipIds.indexOf(clip.id);
                primaryClipId = primaryIndex >= 0 && primaryIndex < newClipIds.length
                  ? newClipIds[primaryIndex]
                  : newClipIds[0] || clip.id;

                if (newClipIds.length > 0) selectClips(newClipIds);
                if (newMaskIds.length > 0) selectMasksForTimeline(newMaskIds);

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

                isLiftedRef.current = true;

                setDragState({
                  type: "clip-move",
                  clipId: primaryClipId,
                  items,
                  startX: x,
                  startY: contentY,
                  startTime: time,
                  originalClipStart: clip.startTime,
                  originalClipDuration: clip.duration,
                  originalTrimIn: clip.trimIn,
                });
              } else {
                // Normal drag: move all selected items
                const items = buildDragItems(activeClipIds, activeMaskIds);
                isLiftedRef.current = true;

                setDragState({
                  type: "clip-move",
                  clipId: primaryClipId,
                  items,
                  startX: x,
                  startY: contentY,
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
            startY: contentY,
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
      getContentY,
      getTrackAtY,
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
      cancelLongPress,
      viewState.scrollX,
      setScrollX,
    ]
  );

  // Ref to hold the latest drag-move handler (avoids stale closures in document listener)
  const moveHandlerRef = useRef<(e: PointerEvent) => void>(() => {});
  moveHandlerRef.current = (e: PointerEvent) => {
    if (dragState.type === "none") return;
    const containerRect = tracksContainerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const x = e.clientX - containerRect.left;
    const contentY = getContentY(e.clientY);
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

        // Cancel long-press timer if user starts moving (horizontal or vertical)
        if (longPressTimerRef.current) {
          const dx = Math.abs(x - dragState.startX);
          const dy = Math.abs(contentY - dragState.startY);
          if (dx > 5 || dy > 5) {
            cancelLongPress();
          }
        }

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
              // Cross-track: only if lifted (mouse always, touch after long-press)
              const targetTrackId = item.id === dragState.clipId && isLiftedRef.current
                ? (getTrackAtY(contentY).trackId || c.trackId)
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
    const onPointerUp = () => {
      cancelLongPress();
      // Keep liftedClipId active after pointerup so the track-selector popup stays visible.
      // Only reset the non-touch lift (mouse cross-track drag).
      if (!liftedClipId) {
        isLiftedRef.current = false;
      }
      setDragState(INITIAL_DRAG_STATE);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
    };
  }, [dragState.type, cancelLongPress, liftedClipId]);

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

  /** Move the lifted clip to a different track (called from track-selector UI) */
  const dropClipToTrack = useCallback(
    (targetTrackId: string) => {
      if (!liftedClipId) return;
      const clip = clips.find((c) => c.id === liftedClipId);
      if (!clip || clip.trackId === targetTrackId) {
        resetLift();
        return;
      }
      saveToHistory();
      moveClip(liftedClipId, targetTrackId, clip.startTime);
      resetLift();
    },
    [liftedClipId, clips, saveToHistory, moveClip, resetLift]
  );

  return {
    dragState,
    handlePointerDown,
    getCursor,
    containerRef,
    liftedClipId,
    dropClipToTrack,
    cancelLift: resetLift,
  };
}
