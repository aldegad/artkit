"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useTimeline, useVideoState, useMask } from "../contexts";
import { useVideoCoordinates } from "./useVideoCoordinates";
import { useTimelineViewport } from "./useTimelineViewport";
import { TimelineDragType, Clip } from "../types";
import { TIMELINE, UI, MASK_LANE_HEIGHT } from "../constants";
import { copyMediaBlob } from "../utils/mediaStorage";

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
  const {
    stateRef: timelineViewportRef,
    ensureTimeVisibleOnLeft,
    setScrollFromGestureAnchor,
  } = useTimelineViewport();

  // Snap a time value to nearby clip edges on the same track.
  const snapToPoints = useCallback(
    (time: number, options?: { trackId?: string; excludeClipIds?: Set<string> }): number => {
      if (!viewState.snapEnabled) return time;

      const threshold = TIMELINE.SNAP_THRESHOLD / zoom; // convert pixels to time
      const points: number[] = [0]; // always include time 0
      const trackId = options?.trackId;
      const excludeClipIds = options?.excludeClipIds || new Set<string>();

      for (const clip of clips) {
        if (trackId && clip.trackId !== trackId) continue;
        if (excludeClipIds.has(clip.id)) continue;
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
  const activePointerIdRef = useRef<number | null>(null);

  // Long-press lift state for cross-track touch movement
  const [liftedClipId, setLiftedClipId] = useState<string | null>(null);
  const isLiftedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Touch pending state: deferred gesture resolution
  const [touchPending, setTouchPending] = useState<TouchPendingState | null>(null);

  const { getMasksForTrack, duplicateMask, updateMaskTime, masks, deselectMask, endMaskEdit, isEditingMask } = useMask();

  const capturePointer = useCallback((pointerId: number) => {
    activePointerIdRef.current = pointerId;
    const el = tracksContainerRef.current;
    if (!el || typeof el.setPointerCapture !== "function") return;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // Best effort.
    }
  }, [tracksContainerRef]);

  const releasePointer = useCallback((pointerId?: number) => {
    const targetPointerId = pointerId ?? activePointerIdRef.current;
    const el = tracksContainerRef.current;
    if (
      targetPointerId !== null &&
      el &&
      typeof el.hasPointerCapture === "function" &&
      typeof el.releasePointerCapture === "function"
    ) {
      try {
        if (el.hasPointerCapture(targetPointerId)) {
          el.releasePointerCapture(targetPointerId);
        }
      } catch {
        // Best effort.
      }
    }

    if (pointerId === undefined || activePointerIdRef.current === pointerId) {
      activePointerIdRef.current = null;
    }
  }, [tracksContainerRef]);

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

  // ── Handle a touch tap (pointerup without significant movement) ──
  const handleTouchTap = useCallback(
    (pending: TouchPendingState) => {
      if (pending.clipResult) {
        selectClip(pending.clipResult.clip.id, false);
      } else {
        const seekTime = Math.max(0, pending.time);
        seek(seekTime);
        ensureTimeVisibleOnLeft(seekTime);
        deselectAll();
      }
    },
    [selectClip, seek, ensureTimeVisibleOnLeft, deselectAll]
  );

  // ── Touch gesture resolution effect ──
  // When touchPending is set, listen for movement to determine: scroll / drag / tap / long-press
  useEffect(() => {
    if (!touchPending) return;

    const gestureStartClientX = touchPending.clientX;
    const gestureStartClientY = touchPending.clientY;
    const gestureStartScrollX = timelineViewportRef.current.scrollX;
    const gestureStartZoom = Math.max(0.001, timelineViewportRef.current.zoom);
    const gestureStartScrollTop = tracksContainerRef.current?.scrollTop ?? 0;
    let resolved = false; // true once we determined scroll vs drag
    let isScrolling = false;

    // Long-press timer: if on a clip body and no movement for LONG_PRESS_MS → lift
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    if (touchPending.clipResult && touchPending.clipResult.handle === "body") {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (resolved) return; // already scrolling or dragging
        resolved = true;

        const clip = touchPending.clipResult!.clip;
        // Select and lift the clip
        selectClip(clip.id, false);
        saveToHistory();
        isLiftedRef.current = true;
        setLiftedClipId(clip.id);
        if (navigator.vibrate) navigator.vibrate(30);

        // Start clip-move drag
        const items = buildDragItems([clip.id], []);
        setDragState({
          type: "clip-move",
          clipId: clip.id,
          items,
          startX: touchPending.x,
          startY: touchPending.contentY,
          startTime: touchPending.time,
          originalClipStart: clip.startTime,
          originalClipDuration: clip.duration,
          originalTrimIn: clip.trimIn,
        });
        setTouchPending(null);
      }, LONG_PRESS_MS);
    }

    const handleMove = (e: PointerEvent) => {
      if (e.pointerId !== touchPending.pointerId) return;

      if (!resolved) {
        const dx = Math.abs(e.clientX - gestureStartClientX);
        const dy = Math.abs(e.clientY - gestureStartClientY);

        if (dx >= TOUCH_GESTURE_THRESHOLD || dy >= TOUCH_GESTURE_THRESHOLD) {
          resolved = true;
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
          // Touch drag defaults to panning the timeline (both X/Y).
          // Clip movement is only activated by long-press lift.
          isScrolling = true;
        }
      }

      // Pan mode: anchor-based mapping (finger distance -> timeline distance 1:1 in pixels).
      if (isScrolling) {
        const deltaYFromStart = gestureStartClientY - e.clientY;

        if (tracksContainerRef.current) {
          tracksContainerRef.current.scrollTop = Math.max(0, gestureStartScrollTop + deltaYFromStart);
        }

        setScrollFromGestureAnchor(
          gestureStartScrollX,
          gestureStartClientX,
          e.clientX,
          gestureStartZoom
        );
      }
    };

    const handleUp = (e: PointerEvent) => {
      if (e.pointerId !== touchPending.pointerId) return;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

      if (!resolved) {
        // No significant movement → tap
        handleTouchTap(touchPending);
      }

      setTouchPending(null);
      releasePointer(e.pointerId);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleUp);

    return () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleUp);
    };
  }, [touchPending, handleTouchTap, tracksContainerRef, selectClip, saveToHistory, buildDragItems, releasePointer, setScrollFromGestureAnchor]);

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
        capturePointer(e.pointerId);

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

      // Middle mouse for pan
      if (e.button === 1) {
        capturePointer(e.pointerId);
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
            capturePointer(e.pointerId);
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
            capturePointer(e.pointerId);
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

              void Promise.all([
                copyMediaBlob(clip.id, firstClip.id),
                copyMediaBlob(clip.id, secondClip.id),
              ]).catch((error) => {
                console.error("Failed to copy media blob on razor split:", error);
              });

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
                // Clear mask active/editing state
                if (isEditingMask) {
                  endMaskEdit();
                } else {
                  deselectMask();
                }
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
                capturePointer(e.pointerId);

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
                capturePointer(e.pointerId);
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
          ensureTimeVisibleOnLeft(seekTime);
          deselectAll();
          // Clear mask active/editing state
          if (isEditingMask) {
            endMaskEdit();
          } else {
            deselectMask();
          }
          capturePointer(e.pointerId);
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
      capturePointer,
      deselectMask,
      endMaskEdit,
      isEditingMask,
      ensureTimeVisibleOnLeft,
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
        ensureTimeVisibleOnLeft(seekTime);
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
        const primaryClip = clips.find((cl) => cl.id === dragState.clipId);
        if (!primaryClip) break;

        const primaryTargetTrackId = isLiftedRef.current
          ? (getTrackAtY(contentY).trackId || primaryClip.trackId)
          : primaryClip.trackId;

        const movingClipIds = new Set(
          dragState.items
            .filter((item) => item.type === "clip")
            .map((item) => item.id)
        );

        const rawStart = Math.max(0, dragState.originalClipStart + deltaTime);
        const snappedStart = snapToPoints(rawStart, {
          trackId: primaryTargetTrackId,
          excludeClipIds: movingClipIds,
        });
        // Also snap end edge: if end snaps, adjust start accordingly
        const rawEnd = rawStart + dragState.originalClipDuration;
        const snappedEnd = snapToPoints(rawEnd, {
          trackId: primaryTargetTrackId,
          excludeClipIds: movingClipIds,
        });
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
              moveClip(item.id, targetTrackId, newStartTime, [...movingClipIds]);
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
          const clip = clips.find((candidate) => candidate.id === dragState.clipId);
          if (!clip) break;
          const rawTrimStart = Math.max(0, dragState.originalClipStart + deltaTime);
          const maxStart = dragState.originalClipStart + dragState.originalClipDuration - TIMELINE.CLIP_MIN_DURATION;
          const clampedStart = Math.min(rawTrimStart, maxStart);
          trimClipStart(dragState.clipId, snapToPoints(clampedStart, {
            trackId: clip.trackId,
            excludeClipIds: new Set([dragState.clipId]),
          }));
        }
        break;

      case "clip-trim-end":
        if (dragState.clipId) {
          const clip = clips.find((candidate) => candidate.id === dragState.clipId);
          if (!clip) break;
          const rawTrimEnd = dragState.originalClipStart + dragState.originalClipDuration + deltaTime;
          const minEnd = dragState.originalClipStart + TIMELINE.CLIP_MIN_DURATION;
          const clampedEnd = Math.max(rawTrimEnd, minEnd);
          trimClipEnd(dragState.clipId, snapToPoints(clampedEnd, {
            trackId: clip.trackId,
            excludeClipIds: new Set([dragState.clipId]),
          }));
        }
        break;
    }
  };

  // Attach document-level listeners during drag for smooth dragging outside timeline
  useEffect(() => {
    if (dragState.type === "none") return;

    const onPointerMove = (e: PointerEvent) => {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
      moveHandlerRef.current(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
      cancelLongPress();
      releasePointer(e.pointerId);
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
      releasePointer();
    };
  }, [dragState.type, cancelLongPress, liftedClipId, releasePointer]);

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
