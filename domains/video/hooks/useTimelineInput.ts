"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useTimeline, useVideoState, useMask } from "../contexts";
import { useVideoCoordinates } from "./useVideoCoordinates";
import { useTimelineViewport } from "./useTimelineViewport";
import { TimelineDragType, Clip } from "../types";
import { GESTURE, TIMELINE, UI, MASK_LANE_HEIGHT } from "../constants";
import { copyMediaBlob } from "../utils/mediaStorage";
import { sliceClipPositionKeyframes } from "../utils/clipTransformKeyframes";
import { useDeferredPointerGesture } from "@/shared/hooks";
import { safeSetPointerCapture, safeReleasePointerCapture } from "@/shared/utils";

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

// ── Touch pending state ───────────────────────────────────────────────
interface TouchPendingState {
  pointerId: number;
  clientX: number;
  clientY: number;
  scrollXOnStart: number;
  zoomOnStart: number;
  scrollTopOnStart: number;
  x: number; // relative to container
  contentY: number; // in content coords (with scroll offset)
  time: number;
  clipResult: { clip: Clip; handle: "start" | "end" | "body" } | null;
}

interface DragPointerPendingState {
  pointerId: number;
  clientX: number;
  clientY: number;
}

interface MiddlePanPendingState {
  pointerId: number;
  clientX: number;
  clientY: number;
  scrollXOnStart: number;
  zoomOnStart: number;
}

interface UseTimelineInputOptions {
  tracksContainerRef: React.RefObject<HTMLDivElement | null>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  getTransformLaneHeight?: (trackId: string) => number;
}

export function useTimelineInput(options: UseTimelineInputOptions) {
  const { tracksContainerRef, containerRef, getTransformLaneHeight } = options;
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
    panByPixels,
    setZoomFromWheelAtPixel,
    ensureTimeVisibleOnLeft,
    setScrollFromGestureAnchor,
  } = useTimelineViewport();

  // Snap a time value to nearby clip edges (optionally track-scoped).
  const snapToPoints = useCallback(
    (
      time: number,
      options?: { scope?: "all" | "track"; trackId?: string; excludeClipIds?: Set<string> }
    ): number => {
      if (!viewState.snapEnabled) return time;

      const threshold = TIMELINE.SNAP_THRESHOLD / zoom; // convert pixels to time
      const points: number[] = [0]; // always include time 0
      const scope = options?.scope ?? "all";
      const trackId = options?.trackId;
      const excludeClipIds = options?.excludeClipIds || new Set<string>();

      for (const clip of clips) {
        if (scope === "track" && trackId && clip.trackId !== trackId) continue;
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
  const activePointerIdRef = useRef<number | null>(null);
  const [dragPointerPending, setDragPointerPending] = useState<DragPointerPendingState | null>(null);
  const [middlePanPending, setMiddlePanPending] = useState<MiddlePanPendingState | null>(null);

  // Long-press lift state for cross-track touch movement
  const [liftedClipId, setLiftedClipId] = useState<string | null>(null);
  const isLiftedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Touch pending state: deferred gesture resolution
  const [touchPending, setTouchPending] = useState<TouchPendingState | null>(null);

  const { getMasksForTrack, duplicateMask, updateMaskTime, masks, deselectMask, endMaskEdit, isEditingMask } = useMask();

  const capturePointer = useCallback((pointerId: number, clientX: number = 0, clientY: number = 0) => {
    activePointerIdRef.current = pointerId;
    setDragPointerPending({ pointerId, clientX, clientY });
    const el = tracksContainerRef.current;
    if (!el) return;
    safeSetPointerCapture(el, pointerId);
  }, [tracksContainerRef]);

  const releasePointer = useCallback((pointerId?: number) => {
    const targetPointerId = pointerId ?? activePointerIdRef.current;
    const el = tracksContainerRef.current;
    if (targetPointerId !== null && el) {
      safeReleasePointerCapture(el, targetPointerId);
    }

    if (pointerId === undefined || activePointerIdRef.current === pointerId) {
      activePointerIdRef.current = null;
      setDragPointerPending(null);
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
    (y: number): { trackId: string | null; inMaskLane: boolean; inTransformLane: boolean } => {
      if (tracks.length === 0 || y < 0) {
        return { trackId: null, inMaskLane: false, inTransformLane: false };
      }

      let offset = 0;
      for (const track of tracks) {
        const hasMasks = getMasksForTrack(track.id).length > 0;
        const transformLaneHeight = Math.max(0, getTransformLaneHeight?.(track.id) || 0);
        const clipEnd = offset + TIMELINE.TRACK_DEFAULT_HEIGHT;
        const transformEnd = clipEnd + transformLaneHeight;
        const trackEnd = transformEnd + (hasMasks ? MASK_LANE_HEIGHT : 0);

        if (y >= offset && y < clipEnd) {
          return { trackId: track.id, inMaskLane: false, inTransformLane: false };
        }

        if (y >= clipEnd && y < transformEnd) {
          return { trackId: track.id, inMaskLane: false, inTransformLane: true };
        }

        if (y >= transformEnd && y < trackEnd) {
          if (hasMasks) {
            return { trackId: track.id, inMaskLane: true, inTransformLane: false };
          }
          return { trackId: track.id, inMaskLane: false, inTransformLane: false };
        }
        offset = trackEnd;
      }

      return { trackId: tracks[tracks.length - 1].id, inMaskLane: false, inTransformLane: false };
    },
    [tracks, getMasksForTrack, getTransformLaneHeight]
  );

  // Find clip at position (returns null for mask lane clicks)
  const findClipAtPosition = useCallback(
    (x: number, contentY: number): { clip: Clip; handle: "start" | "end" | "body" } | null => {
      const { trackId, inMaskLane, inTransformLane } = getTrackAtY(contentY);
      if (!trackId || inMaskLane || inTransformLane) return null;

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

  const clearMaskSelectionState = useCallback(() => {
    if (isEditingMask) {
      endMaskEdit();
      return;
    }
    deselectMask();
  }, [isEditingMask, endMaskEdit, deselectMask]);

  const startClipMoveDrag = useCallback((options: {
    pointerId: number;
    clientX: number;
    clientY: number;
    clipId: string;
    items: DragItem[];
    x: number;
    contentY: number;
    time: number;
    clipStart: number;
    clipDuration: number;
    clipTrimIn: number;
  }) => {
    capturePointer(options.pointerId, options.clientX, options.clientY);
    isLiftedRef.current = true;
    setDragState({
      type: "clip-move",
      clipId: options.clipId,
      items: options.items,
      startX: options.x,
      startY: options.contentY,
      startTime: options.time,
      originalClipStart: options.clipStart,
      originalClipDuration: options.clipDuration,
      originalTrimIn: options.clipTrimIn,
    });
  }, [capturePointer]);

  const splitClipWithRazor = useCallback((clip: Clip, splitCursorTime: number): Clip | null => {
    const rawSplitTime = Math.max(clip.startTime, Math.min(splitCursorTime, clip.startTime + clip.duration));
    const snappedSplitTime = snapToPoints(rawSplitTime, {
      excludeClipIds: new Set([clip.id]),
    });
    const splitTime = Math.max(
      clip.startTime,
      Math.min(snappedSplitTime, clip.startTime + clip.duration)
    );
    const splitOffset = splitTime - clip.startTime;

    // Ignore split at very edges
    if (splitOffset <= TIMELINE.CLIP_MIN_DURATION || clip.duration - splitOffset <= TIMELINE.CLIP_MIN_DURATION) {
      return null;
    }

    saveToHistory();

    const firstDuration = splitOffset;
    const secondDuration = clip.duration - splitOffset;
    const firstTransformKeyframes = sliceClipPositionKeyframes(
      clip,
      0,
      firstDuration,
      { includeStart: true, includeEnd: true }
    );
    const secondTransformKeyframes = sliceClipPositionKeyframes(
      clip,
      splitOffset,
      secondDuration,
      { includeStart: true, includeEnd: false }
    );
    const firstPosition = firstTransformKeyframes?.position?.[0]?.value || clip.position;
    const secondPosition = secondTransformKeyframes?.position?.[0]?.value || clip.position;

    const firstClip: Clip = {
      ...clip,
      id: crypto.randomUUID(),
      duration: firstDuration,
      trimOut: clip.trimIn + firstDuration,
      sourceSize: { ...clip.sourceSize },
      position: { ...firstPosition },
      transformKeyframes: firstTransformKeyframes,
    };

    const secondClip: Clip = {
      ...clip,
      id: crypto.randomUUID(),
      name: `${clip.name} (2)`,
      startTime: splitTime,
      duration: secondDuration,
      trimIn: clip.trimIn + splitOffset,
      sourceSize: { ...clip.sourceSize },
      position: { ...secondPosition },
      transformKeyframes: secondTransformKeyframes,
    };

    void Promise.all([
      copyMediaBlob(clip.id, firstClip.id),
      copyMediaBlob(clip.id, secondClip.id),
    ]).catch((error) => {
      console.error("Failed to copy media blob on razor split:", error);
    });

    removeClip(clip.id);
    addClips([firstClip, secondClip]);
    return secondClip;
  }, [snapToPoints, saveToHistory, removeClip, addClips]);

  const duplicateSelectionForDrag = useCallback((options: {
    activeClipIds: string[];
    activeMaskIds: string[];
    primaryClipId: string;
  }): { primaryClipId: string; items: DragItem[] } => {
    const newClipIds: string[] = [];
    const newMaskIds: string[] = [];

    for (const clipId of options.activeClipIds) {
      const clip = clips.find((candidate) => candidate.id === clipId);
      const duplicatedClipId = duplicateClip(clipId, clip?.trackId);
      if (duplicatedClipId) {
        newClipIds.push(duplicatedClipId);
      }
    }

    for (const maskId of options.activeMaskIds) {
      const duplicatedMaskId = duplicateMask(maskId);
      if (duplicatedMaskId) {
        newMaskIds.push(duplicatedMaskId);
      }
    }

    if (newClipIds.length > 0) {
      selectClips(newClipIds);
    }
    if (newMaskIds.length > 0) {
      selectMasksForTimeline(newMaskIds);
    }

    const primaryIndex = options.activeClipIds.indexOf(options.primaryClipId);
    const resolvedPrimaryClipId = primaryIndex >= 0 && primaryIndex < newClipIds.length
      ? newClipIds[primaryIndex]
      : newClipIds[0] || options.primaryClipId;

    const items: DragItem[] = [];
    for (let i = 0; i < newClipIds.length; i++) {
      const originalClip = clips.find((clip) => clip.id === options.activeClipIds[i]);
      if (originalClip) {
        items.push({ type: "clip", id: newClipIds[i], originalStartTime: originalClip.startTime });
      }
    }
    for (let i = 0; i < newMaskIds.length; i++) {
      const originalMask = masks.get(options.activeMaskIds[i]);
      if (originalMask) {
        items.push({ type: "mask", id: newMaskIds[i], originalStartTime: originalMask.startTime });
      }
    }

    return {
      primaryClipId: resolvedPrimaryClipId,
      items,
    };
  }, [clips, duplicateClip, duplicateMask, masks, selectClips, selectMasksForTimeline]);

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

  useDeferredPointerGesture<TouchPendingState>({
    pending: touchPending,
    thresholdPx: GESTURE.TOUCH_GESTURE_THRESHOLD_PX,
    longPressMs: GESTURE.LONG_PRESS_MS,
    shouldStartLongPress: (pending) =>
      !!(pending.clipResult && pending.clipResult.handle === "body"),
    onLongPress: (pending) => {
      if (!pending.clipResult) return;
      const clip = pending.clipResult.clip;

      // Select and lift the clip.
      selectClip(clip.id, false);
      saveToHistory();
      setLiftedClipId(clip.id);
      if (navigator.vibrate) navigator.vibrate(30);

      const items = buildDragItems([clip.id], []);
      startClipMoveDrag({
        pointerId: pending.pointerId,
        clientX: pending.clientX,
        clientY: pending.clientY,
        clipId: clip.id,
        items,
        x: pending.x,
        contentY: pending.contentY,
        time: pending.time,
        clipStart: clip.startTime,
        clipDuration: clip.duration,
        clipTrimIn: clip.trimIn,
      });
      setTouchPending(null);
    },
    onMoveResolved: ({ pending, event }) => {
      const deltaYFromStart = pending.clientY - event.clientY;
      if (tracksContainerRef.current) {
        tracksContainerRef.current.scrollTop = Math.max(
          0,
          pending.scrollTopOnStart + deltaYFromStart
        );
      }
      setScrollFromGestureAnchor(
        pending.scrollXOnStart,
        pending.clientX,
        event.clientX,
        pending.zoomOnStart
      );
    },
    onTap: handleTouchTap,
    onEnd: (_pending, event) => {
      setTouchPending(null);
      releasePointer(event.pointerId);
    },
  });

  const handleContainerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 1) return;

      e.preventDefault();
      safeSetPointerCapture(e.target, e.pointerId);
      const timelineViewport = timelineViewportRef.current;
      setMiddlePanPending({
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        scrollXOnStart: timelineViewport.scrollX,
        zoomOnStart: Math.max(0.001, timelineViewport.zoom),
      });
    },
    [timelineViewportRef]
  );

  useDeferredPointerGesture<MiddlePanPendingState>({
    pending: middlePanPending,
    thresholdPx: 0,
    onMoveResolved: ({ pending, event }) => {
      setScrollFromGestureAnchor(
        pending.scrollXOnStart,
        pending.clientX,
        event.clientX,
        pending.zoomOnStart
      );
    },
    onEnd: () => {
      setMiddlePanPending(null);
    },
  });

  const handleTimelineWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = tracksContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      setZoomFromWheelAtPixel(e.deltaY, x);
      return;
    }

    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      const delta = e.shiftKey ? e.deltaY : e.deltaX;
      panByPixels(delta);
    }
  }, [tracksContainerRef, setZoomFromWheelAtPixel, panByPixels]);

  useEffect(() => {
    const target = containerRef?.current ?? tracksContainerRef.current;
    if (!target) return;

    target.addEventListener("wheel", handleTimelineWheel, { passive: false });
    return () => target.removeEventListener("wheel", handleTimelineWheel);
  }, [containerRef, tracksContainerRef, handleTimelineWheel]);

  const seekAndKeepVisible = useCallback((time: number) => {
    const seekTime = Math.max(0, time);
    seek(seekTime);
    ensureTimeVisibleOnLeft(seekTime);
  }, [seek, ensureTimeVisibleOnLeft]);

  const handleTouchPointerDown = useCallback((
    e: React.PointerEvent,
    x: number,
    contentY: number,
    time: number,
  ) => {
    const { inMaskLane, inTransformLane } = getTrackAtY(contentY);
    if (inMaskLane) return; // Let MaskClip handle it
    if (inTransformLane) {
      seekAndKeepVisible(time);
      return;
    }

    capturePointer(e.pointerId, e.clientX, e.clientY);
    const timelineViewport = timelineViewportRef.current;
    const clipResult = findClipAtPosition(x, contentY);

    setTouchPending({
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      scrollXOnStart: timelineViewport.scrollX,
      zoomOnStart: Math.max(0.001, timelineViewport.zoom),
      scrollTopOnStart: tracksContainerRef.current?.scrollTop ?? 0,
      x,
      contentY,
      time,
      clipResult,
    });
  }, [capturePointer, findClipAtPosition, getTrackAtY, seekAndKeepVisible, timelineViewportRef, tracksContainerRef]);

  const handlePrimaryPointerDown = useCallback((
    e: React.PointerEvent,
    x: number,
    contentY: number,
    time: number,
  ) => {
    // Check if click is in a mask lane - let MaskClip handle it
    const { inMaskLane, inTransformLane } = getTrackAtY(contentY);
    if (inMaskLane) return;
    if (inTransformLane) {
      seekAndKeepVisible(time);
      return;
    }

    const result = findClipAtPosition(x, contentY);
    if (!result) {
      // Click on empty area - seek and deselect
      seekAndKeepVisible(time);
      deselectAll();
      clearMaskSelectionState();
      capturePointer(e.pointerId, e.clientX, e.clientY);
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
      return;
    }

    const { clip, handle } = result;

    if (
      (handle === "start" || handle === "end")
      && (toolMode === "select" || toolMode === "trim")
    ) {
      capturePointer(e.pointerId, e.clientX, e.clientY);
      saveToHistory();
      setDragState({
        type: handle === "start" ? "clip-trim-start" : "clip-trim-end",
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
      return;
    }

    if (handle !== "body") return;

    if (toolMode === "razor") {
      const splitResult = splitClipWithRazor(clip, time);
      if (splitResult) {
        selectClip(splitResult.id, false);
      }
      return;
    }

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
      clearMaskSelectionState();
    }

    let primaryClipId = clip.id;

    if (e.altKey && toolMode === "select") {
      // Alt+Drag: duplicate ALL selected items and drag the copies
      const duplicated = duplicateSelectionForDrag({
        activeClipIds,
        activeMaskIds,
        primaryClipId: clip.id,
      });
      primaryClipId = duplicated.primaryClipId;

      startClipMoveDrag({
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        clipId: primaryClipId,
        items: duplicated.items,
        x,
        contentY,
        time,
        clipStart: clip.startTime,
        clipDuration: clip.duration,
        clipTrimIn: clip.trimIn,
      });
      return;
    }

    // Normal drag: move all selected items
    const items = buildDragItems(activeClipIds, activeMaskIds);
    startClipMoveDrag({
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      clipId: primaryClipId,
      items,
      x,
      contentY,
      time,
      clipStart: clip.startTime,
      clipDuration: clip.duration,
      clipTrimIn: clip.trimIn,
    });
  }, [
    getTrackAtY,
    seekAndKeepVisible,
    findClipAtPosition,
    deselectAll,
    clearMaskSelectionState,
    capturePointer,
    toolMode,
    saveToHistory,
    selectClip,
    splitClipWithRazor,
    selectedClipIds,
    selectedMaskIds,
    duplicateSelectionForDrag,
    startClipMoveDrag,
    buildDragItems,
  ]);

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
        handleTouchPointerDown(e, x, contentY, time);
        return;
      }

      // Left click
      if (e.button === 0) {
        handlePrimaryPointerDown(e, x, contentY, time);
      }
    },
    [tracksContainerRef, getContentY, pixelToTime, handleTouchPointerDown, handlePrimaryPointerDown]
  );

  const handlePlayheadDragMove = useCallback((time: number) => {
    const seekTime = Math.max(0, time);
    seek(seekTime);
    // Auto-scroll to keep playhead visible when seeking before visible area
    ensureTimeVisibleOnLeft(seekTime);
  }, [seek, ensureTimeVisibleOnLeft]);

  const handleClipMoveDrag = useCallback((options: {
    drag: DragState;
    x: number;
    contentY: number;
    deltaTime: number;
  }) => {
    const { drag, x, contentY, deltaTime } = options;
    if (!drag.clipId || drag.items.length === 0) return;

    // Cancel long-press timer if user starts moving (horizontal or vertical)
    if (longPressTimerRef.current) {
      const dx = Math.abs(x - drag.startX);
      const dy = Math.abs(contentY - drag.startY);
      if (dx > 5 || dy > 5) {
        cancelLongPress();
      }
    }

    const primaryClip = clips.find((candidate) => candidate.id === drag.clipId);
    if (!primaryClip) return;

    const movingClipIds = new Set(
      drag.items
        .filter((item) => item.type === "clip")
        .map((item) => item.id)
    );

    const rawStart = Math.max(0, drag.originalClipStart + deltaTime);
    const snappedStart = snapToPoints(rawStart, {
      excludeClipIds: movingClipIds,
    });
    // Also snap end edge: if end snaps, adjust start accordingly
    const rawEnd = rawStart + drag.originalClipDuration;
    const snappedEnd = snapToPoints(rawEnd, {
      excludeClipIds: movingClipIds,
    });
    const endAdjusted = Math.max(0, snappedEnd - drag.originalClipDuration);
    // Use whichever snap is closer
    const startDelta = Math.abs(snappedStart - rawStart);
    const endDelta = Math.abs(snappedEnd - rawEnd);
    const finalStart = startDelta <= endDelta ? snappedStart : endAdjusted;

    // Time delta from primary clip's original position
    const timeDelta = finalStart - drag.originalClipStart;

    // Move all items by the same time delta
    for (const item of drag.items) {
      const newStartTime = Math.max(0, item.originalStartTime + timeDelta);
      if (item.type === "clip") {
        const clip = clips.find((candidate) => candidate.id === item.id);
        if (clip) {
          // Cross-track: only if lifted (mouse always, touch after long-press)
          const targetTrackId = item.id === drag.clipId && isLiftedRef.current
            ? (getTrackAtY(contentY).trackId || clip.trackId)
            : clip.trackId;
          moveClip(item.id, targetTrackId, newStartTime, [...movingClipIds]);
        }
      } else {
        const mask = masks.get(item.id);
        if (mask) {
          updateMaskTime(item.id, newStartTime, mask.duration);
        }
      }
    }
  }, [cancelLongPress, clips, getTrackAtY, masks, moveClip, snapToPoints, updateMaskTime]);

  const handleClipTrimStartDrag = useCallback((drag: DragState, deltaTime: number) => {
    if (!drag.clipId) return;
    if (!clips.some((candidate) => candidate.id === drag.clipId)) return;
    const rawTrimStart = Math.max(0, drag.originalClipStart + deltaTime);
    const maxStart = drag.originalClipStart + drag.originalClipDuration - TIMELINE.CLIP_MIN_DURATION;
    const clampedStart = Math.min(rawTrimStart, maxStart);
    trimClipStart(drag.clipId, snapToPoints(clampedStart, {
      excludeClipIds: new Set([drag.clipId]),
    }));
  }, [clips, trimClipStart, snapToPoints]);

  const handleClipTrimEndDrag = useCallback((drag: DragState, deltaTime: number) => {
    if (!drag.clipId) return;
    if (!clips.some((candidate) => candidate.id === drag.clipId)) return;
    const rawTrimEnd = drag.originalClipStart + drag.originalClipDuration + deltaTime;
    const minEnd = drag.originalClipStart + TIMELINE.CLIP_MIN_DURATION;
    const clampedEnd = Math.max(rawTrimEnd, minEnd);
    trimClipEnd(drag.clipId, snapToPoints(clampedEnd, {
      excludeClipIds: new Set([drag.clipId]),
    }));
  }, [clips, trimClipEnd, snapToPoints]);

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
      case "playhead":
        handlePlayheadDragMove(time);
        break;
      case "clip-move":
        handleClipMoveDrag({
          drag: dragState,
          x,
          contentY,
          deltaTime,
        });
        break;

      case "clip-trim-start":
        handleClipTrimStartDrag(dragState, deltaTime);
        break;

      case "clip-trim-end":
        handleClipTrimEndDrag(dragState, deltaTime);
        break;

      default:
        break;
    }
  };

  useDeferredPointerGesture<DragPointerPendingState>({
    pending: dragState.type === "none" ? null : dragPointerPending,
    thresholdPx: 0,
    onMoveResolved: ({ event }) => {
      if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
      moveHandlerRef.current(event);
    },
    onEnd: (_pending, event) => {
      if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
      cancelLongPress();
      releasePointer(event.pointerId);
      // Keep liftedClipId active after pointerup so the track-selector popup stays visible.
      // Only reset the non-touch lift (mouse cross-track drag).
      if (!liftedClipId) {
        isLiftedRef.current = false;
      }
      setDragState(INITIAL_DRAG_STATE);
    },
  });

  useEffect(() => {
    return () => {
      releasePointer();
    };
  }, [releasePointer]);

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
    handleContainerPointerDown,
    getCursor,
    liftedClipId,
    dropClipToTrack,
    cancelLift: resetLift,
  };
}
