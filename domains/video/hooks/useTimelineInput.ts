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
      isLiftedRef.current = true;
      setLiftedClipId(clip.id);
      if (navigator.vibrate) navigator.vibrate(30);

      const items = buildDragItems([clip.id], []);
      setDragState({
        type: "clip-move",
        clipId: clip.id,
        items,
        startX: pending.x,
        startY: pending.contentY,
        startTime: pending.time,
        originalClipStart: clip.startTime,
        originalClipDuration: clip.duration,
        originalTrimIn: clip.trimIn,
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

  useEffect(() => {
    const target = containerRef?.current ?? tracksContainerRef.current;
    if (!target) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = tracksContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        setZoomFromWheelAtPixel(e.deltaY, x);
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        panByPixels(delta);
      }
    };

    target.addEventListener("wheel", handleWheel, { passive: false });
    return () => target.removeEventListener("wheel", handleWheel);
  }, [containerRef, tracksContainerRef, timelineViewportRef, setZoomFromWheelAtPixel, panByPixels]);

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
        const { inMaskLane, inTransformLane } = getTrackAtY(contentY);
        if (inMaskLane || inTransformLane) return; // Let lane-specific handlers manage it
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
        return;
      }

      // Left click
      if (e.button === 0) {
        // Check if click is in a mask lane - let MaskClip handle it
        const { inMaskLane, inTransformLane } = getTrackAtY(contentY);
        if (inMaskLane || inTransformLane) return;

        const result = findClipAtPosition(x, contentY);

        if (result) {
          const { clip, handle } = result;

          if (handle === "start" && (toolMode === "select" || toolMode === "trim")) {
            capturePointer(e.pointerId, e.clientX, e.clientY);
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
            capturePointer(e.pointerId, e.clientX, e.clientY);
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
              const rawSplitTime = Math.max(clip.startTime, Math.min(time, clip.startTime + clip.duration));
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
                return;
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
                capturePointer(e.pointerId, e.clientX, e.clientY);

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
                capturePointer(e.pointerId, e.clientX, e.clientY);
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
      timelineViewportRef,
      snapToPoints,
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

        const movingClipIds = new Set(
          dragState.items
            .filter((item) => item.type === "clip")
            .map((item) => item.id)
        );

        const rawStart = Math.max(0, dragState.originalClipStart + deltaTime);
        const snappedStart = snapToPoints(rawStart, {
          excludeClipIds: movingClipIds,
        });
        // Also snap end edge: if end snaps, adjust start accordingly
        const rawEnd = rawStart + dragState.originalClipDuration;
        const snappedEnd = snapToPoints(rawEnd, {
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
          if (!clips.some((candidate) => candidate.id === dragState.clipId)) break;
          const rawTrimStart = Math.max(0, dragState.originalClipStart + deltaTime);
          const maxStart = dragState.originalClipStart + dragState.originalClipDuration - TIMELINE.CLIP_MIN_DURATION;
          const clampedStart = Math.min(rawTrimStart, maxStart);
          trimClipStart(dragState.clipId, snapToPoints(clampedStart, {
            excludeClipIds: new Set([dragState.clipId]),
          }));
        }
        break;

      case "clip-trim-end":
        if (dragState.clipId) {
          if (!clips.some((candidate) => candidate.id === dragState.clipId)) break;
          const rawTrimEnd = dragState.originalClipStart + dragState.originalClipDuration + deltaTime;
          const minEnd = dragState.originalClipStart + TIMELINE.CLIP_MIN_DURATION;
          const clampedEnd = Math.max(rawTrimEnd, minEnd);
          trimClipEnd(dragState.clipId, snapToPoints(clampedEnd, {
            excludeClipIds: new Set([dragState.clipId]),
          }));
        }
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
