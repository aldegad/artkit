"use client";

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { useTimeline, useVideoState, useMask } from "../contexts";
import { useVideoCoordinates } from "./useVideoCoordinates";
import { useTimelineViewport } from "./useTimelineViewport";
import { useTimelinePinchZoom } from "./useTimelinePinchZoom";
import { useTimelineImmediateGesture, useTimelineTouchGesture } from "./useTimelineDeferredGestures";
import { Clip } from "../types";
import { TIMELINE, UI, MASK_LANE_HEIGHT } from "../constants";
import { resolveTimelineClipSelection } from "../utils/timelineSelection";
import {
  buildClipsByTrackIndex,
  calculateSnappedClipMoveTimeDelta,
  getDragAutoScrollDeltaPixels as getDragAutoScrollDeltaPixelsValue,
  isAutoScrollDragType,
  resolveSingleClipTrackSwap,
  snapTimelineTimeToClipPoints,
} from "../utils/timelineDragHelpers";
import {
  type DragItem,
  type DragState,
  INITIAL_TIMELINE_DRAG_STATE,
  createClipMoveDragState,
  createPlayheadDragState,
  createTrimDragState,
} from "../utils/timelineDragState";
import { alignTimelineTimeToFrame, normalizeTimelineFrameRate } from "../utils/timelineFrame";
import { safeSetPointerCapture, safeReleasePointerCapture } from "@/shared/utils";

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

const CLIP_SORT_TRIGGER_RATIO = 0.5;
const DRAG_AUTO_SCROLL_EDGE_PX = 64;
const DRAG_AUTO_SCROLL_MAX_STEP_PX = 28;

export function useTimelineInput(options: UseTimelineInputOptions) {
  const { tracksContainerRef, containerRef, getTransformLaneHeight } = options;
  const {
    tracks,
    clips,
    viewState,
    updateClip,
    moveClip,
    trimClipStart,
    trimClipEnd,
    duplicateClip,
    splitClipAtTime,
    saveToHistory,
  } = useTimeline();
  const {
    project,
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
    setZoomAtPixel,
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
      return snapTimelineTimeToClipPoints(time, {
        snapEnabled: viewState.snapEnabled,
        zoom,
        snapThresholdPx: TIMELINE.SNAP_THRESHOLD,
        clips,
        scope: options?.scope,
        trackId: options?.trackId,
        excludeClipIds: options?.excludeClipIds,
      });
    },
    [viewState.snapEnabled, zoom, clips]
  );

  const frameRate = useMemo(() => {
    return normalizeTimelineFrameRate(project.frameRate);
  }, [project.frameRate]);

  const snapTimeToFrame = useCallback((time: number): number => {
    return alignTimelineTimeToFrame(time, frameRate);
  }, [frameRate]);

  const [dragState, setDragState] = useState<DragState>(INITIAL_TIMELINE_DRAG_STATE);
  const activePointerIdRef = useRef<number | null>(null);
  const [dragPointerPending, setDragPointerPending] = useState<DragPointerPendingState | null>(null);
  const [middlePanPending, setMiddlePanPending] = useState<MiddlePanPendingState | null>(null);

  // Long-press lift state for cross-track touch movement
  const [liftedClipId, setLiftedClipId] = useState<string | null>(null);
  const isLiftedRef = useRef(false);

  // Touch pending state: deferred gesture resolution
  const [touchPending, setTouchPending] = useState<TouchPendingState | null>(null);
  const dragPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const dragAutoScrollRafRef = useRef<number | null>(null);
  const runDragAutoScrollTickRef = useRef<(() => void) | null>(null);
  const [sortingAnimatedClipIds, setSortingAnimatedClipIds] = useState<Set<string>>(new Set());
  const sortingAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { getMasksForTrack, duplicateMask, updateMaskTime, masks, deselectMask, endMaskEdit, isEditingMask } = useMask();

  const clipsByTrackDesc = useMemo(() => buildClipsByTrackIndex(clips, "desc"), [clips]);

  const clipsByTrackAsc = useMemo(() => buildClipsByTrackIndex(clips, "asc"), [clips]);

  const clipsById = useMemo(() => {
    const index = new Map<string, Clip>();
    for (const clip of clips) {
      index.set(clip.id, clip);
    }
    return index;
  }, [clips]);

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

  const {
    handleTouchPinchPointerDown,
    resetPinchState,
  } = useTimelinePinchZoom({
    tracksContainerRef,
    getCurrentZoom: () => Math.max(0.001, timelineViewportRef.current.zoom),
    setZoomAtPixel,
    onPinchStart: () => {
      setTouchPending(null);
      releasePointer();
      setDragState(INITIAL_TIMELINE_DRAG_STATE);
    },
  });

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
    (
      y: number,
      options?: { fallbackToEdgeTrack?: boolean }
    ): { trackId: string | null; inMaskLane: boolean; inTransformLane: boolean } => {
      const fallbackToEdgeTrack = options?.fallbackToEdgeTrack ?? false;
      if (tracks.length === 0) {
        return { trackId: null, inMaskLane: false, inTransformLane: false };
      }
      if (y < 0) {
        if (fallbackToEdgeTrack) {
          return { trackId: tracks[0].id, inMaskLane: false, inTransformLane: false };
        }
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

      if (fallbackToEdgeTrack) {
        return { trackId: tracks[tracks.length - 1].id, inMaskLane: false, inTransformLane: false };
      }
      return { trackId: null, inMaskLane: false, inTransformLane: false };
    },
    [tracks, getMasksForTrack, getTransformLaneHeight]
  );

  // Find clip at position (returns null for mask lane clicks)
  const findClipAtPosition = useCallback(
    (
      x: number,
      contentY: number,
      options?: { trimHandleHitWidth?: number }
    ): { clip: Clip; handle: "start" | "end" | "body" } | null => {
      const { trackId, inMaskLane, inTransformLane } = getTrackAtY(contentY);
      if (!trackId || inMaskLane || inTransformLane) return null;

      const time = pixelToTime(x);
      const trackClips = clipsByTrackDesc.get(trackId) || [];
      const trimHandleHitWidth = options?.trimHandleHitWidth ?? UI.TRIM_HANDLE_WIDTH;

      for (const clip of trackClips) {
        const clipStartX = timeToPixel(clip.startTime);
        const clipEndX = timeToPixel(clip.startTime + clip.duration);
        const isWithinClipOrTrimHotzone =
          x >= clipStartX - trimHandleHitWidth && x <= clipEndX + trimHandleHitWidth;
        if (!isWithinClipOrTrimHotzone) continue;

        // Check for trim handles first (allows grabbing slightly outside clip bounds)
        if (Math.abs(x - clipStartX) <= trimHandleHitWidth) {
          return { clip, handle: "start" };
        }
        if (Math.abs(x - clipEndX) <= trimHandleHitWidth) {
          return { clip, handle: "end" };
        }

        // Check clip body
        if (time >= clip.startTime && time <= clip.startTime + clip.duration) {
          return { clip, handle: "body" };
        }
      }
      return null;
    },
    [getTrackAtY, clipsByTrackDesc, pixelToTime, timeToPixel]
  );

  // Build drag items from selected clips and masks
  const buildDragItems = useCallback(
    (activeClipIds: string[], activeMaskIds: string[]): DragItem[] => {
      const items: DragItem[] = [];
      for (const cid of activeClipIds) {
        const c = clipsById.get(cid);
        if (c) items.push({ type: "clip", id: cid, originalStartTime: c.startTime });
      }
      for (const mid of activeMaskIds) {
        const m = masks.get(mid);
        if (m) items.push({ type: "mask", id: mid, originalStartTime: m.startTime });
      }
      return items;
    },
    [clipsById, masks]
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
    setDragState(createClipMoveDragState({
      clipId: options.clipId,
      items: options.items,
      x: options.x,
      contentY: options.contentY,
      time: options.time,
      clipStart: options.clipStart,
      clipDuration: options.clipDuration,
      clipTrimIn: options.clipTrimIn,
    }));
  }, [capturePointer]);

  const splitClipWithRazor = useCallback((clip: Clip, splitCursorTime: number): string | null => {
    return splitClipAtTime(clip.id, splitCursorTime);
  }, [splitClipAtTime]);

  const duplicateSelectionForDrag = useCallback((options: {
    activeClipIds: string[];
    activeMaskIds: string[];
    primaryClipId: string;
  }): { primaryClipId: string; items: DragItem[] } => {
    const newClipIds: string[] = [];
    const newMaskIds: string[] = [];

    for (const clipId of options.activeClipIds) {
      const duplicatedClipId = duplicateClip(clipId, clipsById.get(clipId)?.trackId);
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
      const originalClip = clipsById.get(options.activeClipIds[i]);
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
  }, [clipsById, duplicateClip, duplicateMask, masks, selectClips, selectMasksForTimeline]);

  /** Reset lift state */
  const resetLift = useCallback(() => {
    isLiftedRef.current = false;
    setLiftedClipId(null);
  }, []);

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

  useTimelineTouchGesture<TouchPendingState>({
    pending: touchPending,
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

  useTimelineImmediateGesture<MiddlePanPendingState>({
    pending: middlePanPending,
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

  useEffect(() => {
    // Safari trackpad pinch emits gesture events instead of ctrl+wheel.
    const target = containerRef?.current ?? tracksContainerRef.current;
    if (!target) return;

    type WebKitGestureEvent = Event & {
      scale?: number;
      clientX?: number;
      preventDefault: () => void;
    };

    let gestureStartZoom = 1;

    const handleGestureStart = (event: Event) => {
      const e = event as WebKitGestureEvent;
      e.preventDefault();
      gestureStartZoom = Math.max(0.001, timelineViewportRef.current.zoom);
    };

    const handleGestureChange = (event: Event) => {
      const e = event as WebKitGestureEvent;
      e.preventDefault();

      const rect = tracksContainerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const scale = Number.isFinite(e.scale) && (e.scale as number) > 0 ? (e.scale as number) : 1;
      const clientX = Number.isFinite(e.clientX) ? (e.clientX as number) : rect.left + rect.width / 2;
      const anchorX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      setZoomAtPixel(gestureStartZoom * scale, anchorX);
    };

    target.addEventListener("gesturestart", handleGestureStart as EventListener, { passive: false });
    target.addEventListener("gesturechange", handleGestureChange as EventListener, { passive: false });

    return () => {
      target.removeEventListener("gesturestart", handleGestureStart as EventListener);
      target.removeEventListener("gesturechange", handleGestureChange as EventListener);
    };
  }, [containerRef, tracksContainerRef, timelineViewportRef, setZoomAtPixel]);

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

    const timelineViewport = timelineViewportRef.current;
    const clipResult = findClipAtPosition(x, contentY, {
      trimHandleHitWidth: UI.TRIM_HANDLE_TOUCH_WIDTH,
    });

    // Touch trim should start immediately (no long-press/pan arbitration)
    if (
      clipResult
      && (clipResult.handle === "start" || clipResult.handle === "end")
      && (toolMode === "select" || toolMode === "trim")
    ) {
      e.preventDefault();
      capturePointer(e.pointerId, e.clientX, e.clientY);
      saveToHistory();
      setDragState(createTrimDragState({
        handle: clipResult.handle,
        clipId: clipResult.clip.id,
        x,
        contentY,
        time,
        clipStart: clipResult.clip.startTime,
        clipDuration: clipResult.clip.duration,
        clipTrimIn: clipResult.clip.trimIn,
      }));
      selectClip(clipResult.clip.id, false);
      return;
    }

    capturePointer(e.pointerId, e.clientX, e.clientY);
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
  }, [
    capturePointer,
    findClipAtPosition,
    getTrackAtY,
    seekAndKeepVisible,
    timelineViewportRef,
    tracksContainerRef,
    toolMode,
    saveToHistory,
    selectClip,
  ]);

  const startPlayheadDrag = useCallback((options: {
    pointerId: number;
    clientX: number;
    clientY: number;
    x: number;
    contentY: number;
    time: number;
  }) => {
    seekAndKeepVisible(options.time);
    deselectAll();
    clearMaskSelectionState();
    capturePointer(options.pointerId, options.clientX, options.clientY);
    setDragState(createPlayheadDragState({
      x: options.x,
      contentY: options.contentY,
      time: options.time,
    }));
  }, [seekAndKeepVisible, deselectAll, clearMaskSelectionState, capturePointer]);

  const startTrimDrag = useCallback((options: {
    pointerId: number;
    clientX: number;
    clientY: number;
    handle: "start" | "end";
    clip: Clip;
    x: number;
    contentY: number;
    time: number;
    shiftKey: boolean;
  }) => {
    capturePointer(options.pointerId, options.clientX, options.clientY);
    saveToHistory();
    setDragState(createTrimDragState({
      handle: options.handle,
      clipId: options.clip.id,
      x: options.x,
      contentY: options.contentY,
      time: options.time,
      clipStart: options.clip.startTime,
      clipDuration: options.clip.duration,
      clipTrimIn: options.clip.trimIn,
    }));
    selectClip(options.clip.id, options.shiftKey);
  }, [capturePointer, saveToHistory, selectClip]);

  const handleClipBodyPointerDown = useCallback((options: {
    event: React.PointerEvent;
    clip: Clip;
    x: number;
    contentY: number;
    time: number;
  }) => {
    const { event, clip, x, contentY, time } = options;
    if (toolMode === "razor") {
      const splitClipId = splitClipWithRazor(clip, time);
      if (splitClipId) {
        selectClip(splitClipId, false);
      }
      return;
    }

    saveToHistory();
    const resolvedSelection = resolveTimelineClipSelection({
      clipId: clip.id,
      selectedClipIds,
      selectedMaskIds,
      shiftKey: event.shiftKey,
    });
    const { activeClipIds, activeMaskIds } = resolvedSelection;
    if (resolvedSelection.shouldSelectClip) {
      selectClip(clip.id, resolvedSelection.selectAppend);
    }
    if (resolvedSelection.shouldClearMaskSelection) {
      clearMaskSelectionState();
    }

    let primaryClipId = clip.id;

    if (event.altKey && toolMode === "select") {
      // Alt+Drag: duplicate ALL selected items and drag the copies
      const duplicated = duplicateSelectionForDrag({
        activeClipIds,
        activeMaskIds,
        primaryClipId: clip.id,
      });
      primaryClipId = duplicated.primaryClipId;

      startClipMoveDrag({
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
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
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
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
    toolMode,
    splitClipWithRazor,
    selectClip,
    saveToHistory,
    selectedClipIds,
    selectedMaskIds,
    clearMaskSelectionState,
    duplicateSelectionForDrag,
    startClipMoveDrag,
    buildDragItems,
  ]);

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

    const result = findClipAtPosition(x, contentY, {
      trimHandleHitWidth: UI.TRIM_HANDLE_WIDTH,
    });
    if (!result) {
      startPlayheadDrag({
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        x,
        contentY,
        time,
      });
      return;
    }

    const { clip, handle } = result;

    if (
      (handle === "start" || handle === "end")
      && (toolMode === "select" || toolMode === "trim")
    ) {
      startTrimDrag({
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        handle,
        clip,
        x,
        contentY,
        time,
        shiftKey: e.shiftKey,
      });
      return;
    }

    if (handle !== "body") return;
    handleClipBodyPointerDown({ event: e, clip, x, contentY, time });
  }, [
    getTrackAtY,
    seekAndKeepVisible,
    findClipAtPosition,
    startPlayheadDrag,
    toolMode,
    startTrimDrag,
    handleClipBodyPointerDown,
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
        if (handleTouchPinchPointerDown(e)) {
          return;
        }

        handleTouchPointerDown(e, x, contentY, time);
        return;
      }

      // Left click
      if (e.button === 0) {
        handlePrimaryPointerDown(e, x, contentY, time);
      }
    },
    [
      tracksContainerRef,
      getContentY,
      pixelToTime,
      handleTouchPinchPointerDown,
      handleTouchPointerDown,
      handlePrimaryPointerDown,
    ]
  );

  const handlePlayheadDragMove = useCallback((time: number) => {
    const seekTime = Math.max(0, time);
    seek(seekTime);
    // Auto-scroll to keep playhead visible when seeking before visible area
    ensureTimeVisibleOnLeft(seekTime);
  }, [seek, ensureTimeVisibleOnLeft]);

  const stopDragAutoScroll = useCallback(() => {
    if (dragAutoScrollRafRef.current !== null) {
      cancelAnimationFrame(dragAutoScrollRafRef.current);
      dragAutoScrollRafRef.current = null;
    }
  }, []);

  const triggerSortingAnimation = useCallback((clipIds: string[]) => {
    if (clipIds.length === 0) return;
    setSortingAnimatedClipIds(new Set(clipIds));
    if (sortingAnimationTimerRef.current) {
      clearTimeout(sortingAnimationTimerRef.current);
    }
    sortingAnimationTimerRef.current = setTimeout(() => {
      sortingAnimationTimerRef.current = null;
      setSortingAnimatedClipIds(new Set());
    }, 220);
  }, []);

  const getDragAutoScrollDeltaPixels = useCallback((x: number, width: number): number => {
    return getDragAutoScrollDeltaPixelsValue(x, width, {
      edgePx: DRAG_AUTO_SCROLL_EDGE_PX,
      maxStepPx: DRAG_AUTO_SCROLL_MAX_STEP_PX,
    });
  }, []);

  const getTimeAtPixelWithViewport = useCallback((pixel: number): number => {
    const viewport = timelineViewportRef.current;
    const zoomValue = Math.max(0.001, viewport.zoom);
    return Math.max(0, viewport.scrollX + pixel / zoomValue);
  }, [timelineViewportRef]);

  const getSnappedClipMoveTimeDelta = useCallback((drag: DragState, deltaTime: number, movingClipIds: Set<string>) => {
    return calculateSnappedClipMoveTimeDelta({
      drag,
      deltaTime,
      movingClipIds,
      snapTime: snapToPoints,
    });
  }, [snapToPoints]);

  const maybeSortSingleClipWithinTrack = useCallback((options: {
    drag: DragState;
    deltaTime: number;
    pointerTrackId: string | null;
  }): boolean => {
    const swap = resolveSingleClipTrackSwap({
      drag: options.drag,
      deltaTime: options.deltaTime,
      pointerTrackId: options.pointerTrackId,
      clipsById,
      clipsByTrackAsc,
      triggerRatio: CLIP_SORT_TRIGGER_RATIO,
    });
    if (!swap) return false;

    for (const update of swap.updates) {
      updateClip(update.id, { startTime: snapTimeToFrame(update.startTime) });
    }
    triggerSortingAnimation(swap.updates.map((update) => update.id));
    return true;
  }, [clipsById, clipsByTrackAsc, snapTimeToFrame, updateClip, triggerSortingAnimation]);

  const handleClipMoveDrag = useCallback((options: {
    drag: DragState;
    contentY: number;
    deltaTime: number;
  }) => {
    const { drag, contentY, deltaTime } = options;
    if (!drag.clipId || drag.items.length === 0) return;

    const primaryClip = clipsById.get(drag.clipId) || null;
    if (!primaryClip) return;

    const movingClipIds = new Set(
      drag.items
        .filter((item) => item.type === "clip")
        .map((item) => item.id)
    );
    const pointerTrackId = getTrackAtY(contentY, { fallbackToEdgeTrack: true }).trackId || null;

    if (maybeSortSingleClipWithinTrack({
      drag,
      deltaTime,
      pointerTrackId,
    })) {
      return;
    }

    const timeDelta = getSnappedClipMoveTimeDelta(drag, deltaTime, movingClipIds);

    // Move all items by the same time delta.
    for (const item of drag.items) {
      const newStartTime = snapTimeToFrame(item.originalStartTime + timeDelta);
      if (item.type === "clip") {
        const clip = clipsById.get(item.id) || null;
        if (clip) {
          // Cross-track: only if lifted (mouse always, touch after long-press).
          const targetTrackId = item.id === drag.clipId && isLiftedRef.current
            ? (pointerTrackId || clip.trackId)
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
  }, [
    clipsById,
    maybeSortSingleClipWithinTrack,
    getTrackAtY,
    getSnappedClipMoveTimeDelta,
    masks,
    moveClip,
    snapTimeToFrame,
    updateMaskTime,
  ]);

  const handleClipTrimStartDrag = useCallback((drag: DragState, deltaTime: number) => {
    if (!drag.clipId) return;
    if (!clipsById.has(drag.clipId)) return;
    const rawTrimStart = Math.max(0, drag.originalClipStart + deltaTime);
    const maxStart = drag.originalClipStart + drag.originalClipDuration - TIMELINE.CLIP_MIN_DURATION;
    const clampedStart = Math.min(rawTrimStart, maxStart);
    const snappedStart = snapToPoints(clampedStart, {
      excludeClipIds: new Set([drag.clipId]),
    });
    trimClipStart(drag.clipId, snapTimeToFrame(snappedStart));
  }, [clipsById, trimClipStart, snapToPoints, snapTimeToFrame]);

  const handleClipTrimEndDrag = useCallback((drag: DragState, deltaTime: number) => {
    if (!drag.clipId) return;
    if (!clipsById.has(drag.clipId)) return;
    const rawTrimEnd = drag.originalClipStart + drag.originalClipDuration + deltaTime;
    const minEnd = drag.originalClipStart + TIMELINE.CLIP_MIN_DURATION;
    const clampedEnd = Math.max(rawTrimEnd, minEnd);
    const snappedEnd = snapToPoints(clampedEnd, {
      excludeClipIds: new Set([drag.clipId]),
    });
    trimClipEnd(drag.clipId, snapTimeToFrame(snappedEnd));
  }, [clipsById, trimClipEnd, snapToPoints, snapTimeToFrame]);

  const applyDragAtPosition = useCallback((options: {
    drag: DragState;
    x: number;
    contentY: number;
    time: number;
  }) => {
    const { drag, x, contentY, time } = options;
    const deltaTime = time - drag.startTime;

    switch (drag.type) {
      case "playhead":
        handlePlayheadDragMove(time);
        break;
      case "clip-move":
        handleClipMoveDrag({
          drag,
          contentY,
          deltaTime,
        });
        break;
      case "clip-trim-start":
        handleClipTrimStartDrag(drag, deltaTime);
        break;
      case "clip-trim-end":
        handleClipTrimEndDrag(drag, deltaTime);
        break;
      default:
        break;
    }
  }, [
    handlePlayheadDragMove,
    handleClipMoveDrag,
    handleClipTrimStartDrag,
    handleClipTrimEndDrag,
  ]);

  const runDragAutoScrollTick = useCallback(() => {
    dragAutoScrollRafRef.current = null;
    const pointer = dragPointerRef.current;
    if (!pointer) return;
    if (!isAutoScrollDragType(dragState.type)) {
      return;
    }

    const containerRect = tracksContainerRef.current?.getBoundingClientRect();
    if (!containerRect || containerRect.width <= 0) return;

    const x = pointer.clientX - containerRect.left;
    const autoScrollDeltaPixels = getDragAutoScrollDeltaPixels(x, containerRect.width);
    if (autoScrollDeltaPixels === 0) return;

    panByPixels(autoScrollDeltaPixels);

    const contentY = getContentY(pointer.clientY);
    const time = getTimeAtPixelWithViewport(x);
    applyDragAtPosition({
      drag: dragState,
      x,
      contentY,
      time,
    });

    dragAutoScrollRafRef.current = requestAnimationFrame(() => {
      runDragAutoScrollTickRef.current?.();
    });
  }, [
    dragState,
    tracksContainerRef,
    getDragAutoScrollDeltaPixels,
    panByPixels,
    getContentY,
    getTimeAtPixelWithViewport,
    applyDragAtPosition,
  ]);
  runDragAutoScrollTickRef.current = runDragAutoScrollTick;

  const ensureDragAutoScrollRunning = useCallback(() => {
    if (dragAutoScrollRafRef.current !== null) return;
    dragAutoScrollRafRef.current = requestAnimationFrame(() => {
      runDragAutoScrollTickRef.current?.();
    });
  }, []);

  const handleDragPointerMove = useCallback((e: PointerEvent) => {
    if (dragState.type === "none") return;
    const containerRect = tracksContainerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    dragPointerRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
    };

    const x = e.clientX - containerRect.left;
    const contentY = getContentY(e.clientY);
    const shouldAutoScroll = isAutoScrollDragType(dragState.type);
    if (shouldAutoScroll) {
      const autoScrollDeltaPixels = getDragAutoScrollDeltaPixels(x, containerRect.width);
      if (autoScrollDeltaPixels !== 0) {
        panByPixels(autoScrollDeltaPixels);
        ensureDragAutoScrollRunning();
      } else {
        stopDragAutoScroll();
      }
    } else {
      stopDragAutoScroll();
    }

    const time = getTimeAtPixelWithViewport(x);
    applyDragAtPosition({
      drag: dragState,
      x,
      contentY,
      time,
    });
  }, [
    dragState,
    tracksContainerRef,
    getDragAutoScrollDeltaPixels,
    panByPixels,
    ensureDragAutoScrollRunning,
    stopDragAutoScroll,
    getContentY,
    getTimeAtPixelWithViewport,
    applyDragAtPosition,
  ]);

  useTimelineImmediateGesture<DragPointerPendingState>({
    pending: dragState.type === "none" ? null : dragPointerPending,
    onMoveResolved: ({ event }) => {
      if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
      handleDragPointerMove(event);
    },
    onEnd: (_pending, event) => {
      if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
      stopDragAutoScroll();
      dragPointerRef.current = null;
      releasePointer(event.pointerId);
      if (event.pointerType === "touch") {
        resetLift();
      } else if (!liftedClipId) {
        isLiftedRef.current = false;
      }
      setDragState(INITIAL_TIMELINE_DRAG_STATE);
    },
  });

  useEffect(() => {
    if (!isAutoScrollDragType(dragState.type)) {
      stopDragAutoScroll();
      if (dragState.type === "none") {
        dragPointerRef.current = null;
      }
    }
  }, [dragState.type, stopDragAutoScroll]);

  // Keep resize cursor stable while trim dragging, even if pointer leaves the handle.
  useEffect(() => {
    if (dragState.type !== "clip-trim-start" && dragState.type !== "clip-trim-end") {
      return;
    }

    const previousBodyCursor = document.body.style.cursor;
    const previousRootCursor = document.documentElement.style.cursor;
    document.body.style.cursor = "ew-resize";
    document.documentElement.style.cursor = "ew-resize";

    return () => {
      document.body.style.cursor = previousBodyCursor;
      document.documentElement.style.cursor = previousRootCursor;
    };
  }, [dragState.type]);

  useEffect(() => {
    return () => {
      stopDragAutoScroll();
      if (sortingAnimationTimerRef.current) {
        clearTimeout(sortingAnimationTimerRef.current);
        sortingAnimationTimerRef.current = null;
      }
      dragPointerRef.current = null;
      resetPinchState();
      releasePointer();
    };
  }, [releasePointer, resetPinchState, stopDragAutoScroll]);

  /** Move the lifted clip to a different track (called from track-selector UI) */
  const dropClipToTrack = useCallback(
    (targetTrackId: string) => {
      if (!liftedClipId) return;
      const clip = clipsById.get(liftedClipId) || null;
      if (!clip || clip.trackId === targetTrackId) {
        resetLift();
        return;
      }
      saveToHistory();
      moveClip(liftedClipId, targetTrackId, clip.startTime);
      resetLift();
    },
    [liftedClipId, clipsById, saveToHistory, moveClip, resetLift]
  );

  const draggingClipIds = useMemo(() => {
    if (dragState.type !== "clip-move") return new Set<string>();
    return new Set(
      dragState.items
        .filter((item) => item.type === "clip")
        .map((item) => item.id)
    );
  }, [dragState]);

  return {
    dragState,
    handlePointerDown,
    handleContainerPointerDown,
    liftedClipId,
    draggingClipIds,
    sortingAnimatedClipIds,
    dropClipToTrack,
    cancelLift: resetLift,
  };
}
