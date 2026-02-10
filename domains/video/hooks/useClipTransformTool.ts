"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ASPECT_RATIO_VALUES, type AspectRatio } from "@/shared/types/aspectRatio";
import {
  getRectHandleAtPosition,
  resizeRectByHandle,
  type RectHandle,
} from "@/shared/utils/rectTransform";
import { Clip, VideoToolMode, getClipScaleX, getClipScaleY } from "../types";

type TransformHandle = RectHandle | "move" | null;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TransformSnapshot {
  clipId: string;
  position: { x: number; y: number };
  scale: number;
  scaleX: number;
  scaleY: number;
}

interface UseClipTransformToolOptions {
  clips: Clip[];
  selectedClipIds: string[];
  toolMode: VideoToolMode;
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  saveToHistory: () => void;
  screenToProject: (clientX: number, clientY: number, allowOutside?: boolean) => { x: number; y: number } | null;
  hitTestClipAtPoint: (point: { x: number; y: number }) => Clip | null;
}

export interface ClipTransformState {
  isActive: boolean;
  clipId: string | null;
  bounds: Rect | null;
  aspectRatio: AspectRatio;
}

interface ClipTransformApi {
  state: ClipTransformState;
  cursor: string;
  startTransformForSelection: () => boolean;
  startTransformForClip: (clipId: string) => boolean;
  applyTransform: () => void;
  cancelTransform: () => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handlePointerUp: () => void;
}

const HANDLE_SIZE = 10;
const MIN_SIZE = 10;
const EPSILON = 0.0001;

function cursorForHandle(handle: TransformHandle, dragging: boolean): string {
  if (!handle) return "default";
  if (handle === "move") return dragging ? "grabbing" : "move";
  const cursorMap: Record<RectHandle, string> = {
    nw: "nwse-resize",
    se: "nwse-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
  };
  return cursorMap[handle];
}

function getClipRect(clip: Clip): Rect {
  return {
    x: clip.position.x,
    y: clip.position.y,
    width: clip.sourceSize.width * getClipScaleX(clip),
    height: clip.sourceSize.height * getClipScaleY(clip),
  };
}

export function useClipTransformTool(options: UseClipTransformToolOptions): ClipTransformApi {
  const {
    clips,
    selectedClipIds,
    toolMode,
    selectClip,
    updateClip,
    saveToHistory,
    screenToProject,
    hitTestClipAtPoint,
  } = options;

  const clipsRef = useRef(clips);
  clipsRef.current = clips;

  const [state, setState] = useState<ClipTransformState>({
    isActive: false,
    clipId: null,
    bounds: null,
    aspectRatio: "free",
  });
  const [cursor, setCursor] = useState("default");

  const boundsRef = useRef<Rect | null>(null);
  const snapshotRef = useRef<TransformSnapshot | null>(null);
  const historySavedRef = useRef(false);
  const activeHandleRef = useRef<TransformHandle>(null);
  const dragRef = useRef<{
    dragging: boolean;
    pointerStart: { x: number; y: number };
    originalBounds: Rect | null;
  }>({
    dragging: false,
    pointerStart: { x: 0, y: 0 },
    originalBounds: null,
  });

  const setBounds = useCallback((nextBounds: Rect | null) => {
    boundsRef.current = nextBounds;
    setState((prev) => ({
      ...prev,
      bounds: nextBounds ? { ...nextBounds } : null,
    }));
  }, []);

  const stopDragging = useCallback(() => {
    dragRef.current.dragging = false;
    dragRef.current.originalBounds = null;
    activeHandleRef.current = null;
  }, []);

  const finishSession = useCallback((keepAspectRatio: AspectRatio) => {
    stopDragging();
    historySavedRef.current = false;
    snapshotRef.current = null;
    setCursor("default");
    setState({
      isActive: false,
      clipId: null,
      bounds: null,
      aspectRatio: keepAspectRatio,
    });
    boundsRef.current = null;
  }, [stopDragging]);

  const applyBoundsToClip = useCallback((bounds: Rect) => {
    const clipId = snapshotRef.current?.clipId;
    if (!clipId) return;

    const clip = clipsRef.current.find((candidate) => candidate.id === clipId);
    if (!clip || clip.type === "audio") return;

    const sourceW = Math.max(EPSILON, clip.sourceSize.width);
    const sourceH = Math.max(EPSILON, clip.sourceSize.height);
    const baseScale = Math.max(EPSILON, typeof clip.scale === "number" ? clip.scale : 1);
    const nextScaleX = (bounds.width / sourceW) / baseScale;
    const nextScaleY = (bounds.height / sourceH) / baseScale;

    updateClip(clipId, {
      position: { x: bounds.x, y: bounds.y },
      scaleX: Math.max(0.01, nextScaleX),
      scaleY: Math.max(0.01, nextScaleY),
    });
    setBounds(bounds);
  }, [setBounds, updateClip]);

  const startTransformForClip = useCallback((clipId: string): boolean => {
    const clip = clipsRef.current.find((candidate) => candidate.id === clipId);
    if (!clip || clip.type === "audio") return false;

    const rect = getClipRect(clip);
    snapshotRef.current = {
      clipId: clip.id,
      position: { ...clip.position },
      scale: typeof clip.scale === "number" ? clip.scale : 1,
      scaleX: typeof clip.scaleX === "number" ? clip.scaleX : 1,
      scaleY: typeof clip.scaleY === "number" ? clip.scaleY : 1,
    };
    historySavedRef.current = false;
    activeHandleRef.current = null;
    dragRef.current.dragging = false;

    setCursor("default");
    setState((prev) => ({
      ...prev,
      isActive: true,
      clipId: clip.id,
      bounds: rect,
    }));
    boundsRef.current = rect;
    return true;
  }, []);

  const startTransformForSelection = useCallback((): boolean => {
    const selectedVisualClipId = selectedClipIds.find((clipId) => {
      const clip = clipsRef.current.find((candidate) => candidate.id === clipId);
      return !!clip && clip.type !== "audio";
    });
    if (!selectedVisualClipId) return false;
    return startTransformForClip(selectedVisualClipId);
  }, [selectedClipIds, startTransformForClip]);

  const applyTransform = useCallback(() => {
    const currentAspectRatio = state.aspectRatio;
    finishSession(currentAspectRatio);
  }, [finishSession, state.aspectRatio]);

  const cancelTransform = useCallback(() => {
    const snapshot = snapshotRef.current;
    const currentAspectRatio = state.aspectRatio;
    if (snapshot) {
      updateClip(snapshot.clipId, {
        position: { ...snapshot.position },
        scale: snapshot.scale,
        scaleX: snapshot.scaleX,
        scaleY: snapshot.scaleY,
      });
    }
    finishSession(currentAspectRatio);
  }, [finishSession, state.aspectRatio, updateClip]);

  const setAspectRatio = useCallback((ratio: AspectRatio) => {
    setState((prev) => ({ ...prev, aspectRatio: ratio }));
  }, []);

  const resolveHandleAtPoint = useCallback((point: { x: number; y: number }): TransformHandle => {
    const bounds = boundsRef.current;
    if (!bounds) return null;
    return getRectHandleAtPosition(point, bounds, {
      handleSize: HANDLE_SIZE,
      includeMove: true,
    }) as TransformHandle;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (toolMode !== "transform") return false;

    const point = screenToProject(e.clientX, e.clientY, true);
    if (!point) return false;

    if (!state.isActive || !boundsRef.current || !snapshotRef.current) {
      const hitClip = hitTestClipAtPoint(point);
      if (!hitClip || hitClip.type === "audio") return false;
      selectClip(hitClip.id, false);
      const started = startTransformForClip(hitClip.id);
      if (!started) return false;
    }

    let handle = resolveHandleAtPoint(point);
    if (!handle) {
      const hitClip = hitTestClipAtPoint(point);
      if (hitClip && hitClip.type !== "audio" && hitClip.id !== snapshotRef.current?.clipId) {
        selectClip(hitClip.id, false);
        if (startTransformForClip(hitClip.id)) {
          handle = resolveHandleAtPoint(point);
        }
      }
    }

    if (!handle || !boundsRef.current) {
      setCursor("default");
      return false;
    }

    if (!historySavedRef.current) {
      saveToHistory();
      historySavedRef.current = true;
    }

    activeHandleRef.current = handle;
    dragRef.current.dragging = true;
    dragRef.current.pointerStart = point;
    dragRef.current.originalBounds = { ...boundsRef.current };
    setCursor(cursorForHandle(handle, true));

    return true;
  }, [
    hitTestClipAtPoint,
    resolveHandleAtPoint,
    saveToHistory,
    screenToProject,
    selectClip,
    startTransformForClip,
    state.isActive,
    toolMode,
  ]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (toolMode !== "transform" || !snapshotRef.current || !boundsRef.current) return false;

    const point = screenToProject(e.clientX, e.clientY, true);
    if (!point) return false;

    if (!dragRef.current.dragging || !dragRef.current.originalBounds || !activeHandleRef.current) {
      const hoverHandle = resolveHandleAtPoint(point);
      setCursor(cursorForHandle(hoverHandle, false));
      return false;
    }

    const dx = point.x - dragRef.current.pointerStart.x;
    const dy = point.y - dragRef.current.pointerStart.y;
    const originalBounds = dragRef.current.originalBounds;
    const currentHandle = activeHandleRef.current;
    let nextBounds: Rect = { ...originalBounds };

    if (currentHandle === "move") {
      nextBounds.x = originalBounds.x + dx;
      nextBounds.y = originalBounds.y + dy;
    } else {
      const originalAspect = originalBounds.width / Math.max(EPSILON, originalBounds.height);
      const keepAspect = e.shiftKey || state.aspectRatio !== "free";
      let targetAspect = originalAspect;

      if (state.aspectRatio === "fixed" || e.shiftKey) {
        targetAspect = originalAspect;
      } else if (state.aspectRatio !== "free") {
        const ratioValue = ASPECT_RATIO_VALUES[state.aspectRatio];
        if (ratioValue !== null) {
          targetAspect = ratioValue;
        }
      }

      nextBounds = resizeRectByHandle(
        originalBounds,
        currentHandle,
        { dx, dy },
        {
          minWidth: MIN_SIZE,
          minHeight: MIN_SIZE,
          keepAspect,
          targetAspect,
          fromCenter: e.altKey,
        }
      );
    }

    applyBoundsToClip(nextBounds);
    setCursor(cursorForHandle(currentHandle, true));
    return true;
  }, [applyBoundsToClip, resolveHandleAtPoint, screenToProject, state.aspectRatio, toolMode]);

  const handlePointerUp = useCallback(() => {
    if (!snapshotRef.current && !dragRef.current.dragging) return;
    const currentHandle = activeHandleRef.current;
    stopDragging();
    setCursor(cursorForHandle(currentHandle, false));
  }, [stopDragging]);

  useEffect(() => {
    if (toolMode !== "transform" && state.isActive) {
      applyTransform();
    }
  }, [applyTransform, state.isActive, toolMode]);

  useEffect(() => {
    if (toolMode !== "transform") return;

    const selectedVisualClipId = selectedClipIds.find((selectedId) => {
      const clip = clipsRef.current.find((candidate) => candidate.id === selectedId);
      return !!clip && clip.type !== "audio";
    });

    if (!selectedVisualClipId) {
      if (state.isActive) {
        finishSession(state.aspectRatio);
      }
      return;
    }

    if (!state.isActive || !state.clipId) {
      startTransformForClip(selectedVisualClipId);
      return;
    }

    if (state.clipId !== selectedVisualClipId) {
      stopDragging();
      startTransformForClip(selectedVisualClipId);
    }
  }, [
    finishSession,
    selectedClipIds,
    startTransformForClip,
    state.aspectRatio,
    state.clipId,
    state.isActive,
    stopDragging,
    toolMode,
  ]);

  useEffect(() => {
    if (!state.isActive || !state.clipId) return;
    const clip = clips.find((candidate) => candidate.id === state.clipId);
    if (!clip || clip.type === "audio") {
      finishSession(state.aspectRatio);
      return;
    }
    const rect = getClipRect(clip);
    setBounds(rect);
  }, [clips, finishSession, setBounds, state.aspectRatio, state.clipId, state.isActive]);

  return {
    state,
    cursor,
    startTransformForSelection,
    startTransformForClip,
    applyTransform,
    cancelTransform,
    setAspectRatio,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
