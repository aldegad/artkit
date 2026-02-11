"use client";

import { useCallback, useRef, useState } from "react";
import { Clip } from "../../types";
import {
  getClipPositionKeyframes,
  resolveClipPositionAtTimelineTime,
  upsertClipPositionKeyframeAtTimelineTime,
} from "../../utils/clipTransformKeyframes";

interface Point {
  x: number;
  y: number;
}

interface ClipDragState {
  clipId: string | null;
  pointerStart: Point;
  clipStart: Point;
  clipSnapshot: Clip | null;
}

const INITIAL_CLIP_DRAG_STATE: ClipDragState = {
  clipId: null,
  pointerStart: { x: 0, y: 0 },
  clipStart: { x: 0, y: 0 },
  clipSnapshot: null,
};

interface UsePreviewClipDragSessionOptions {
  toolMode: string;
  autoKeyframeEnabled: boolean;
  currentTimeRef: React.RefObject<number>;
  screenToProject: (clientX: number, clientY: number, allowOutside?: boolean) => Point | null;
  hitTestClipAtPoint: (point: Point) => Clip | null;
  saveToHistory: () => void;
  selectClip: (clipId: string, append?: boolean) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  scheduleRender: () => void;
}

interface UsePreviewClipDragSessionResult {
  isDraggingClip: boolean;
  handleClipPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleClipPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleClipPointerUp: () => void;
}

export function usePreviewClipDragSession(
  options: UsePreviewClipDragSessionOptions
): UsePreviewClipDragSessionResult {
  const {
    toolMode,
    autoKeyframeEnabled,
    currentTimeRef,
    screenToProject,
    hitTestClipAtPoint,
    saveToHistory,
    selectClip,
    updateClip,
    scheduleRender,
  } = options;
  const dragStateRef = useRef<ClipDragState>(INITIAL_CLIP_DRAG_STATE);
  const [isDraggingClip, setIsDraggingClip] = useState(false);

  const resetClipDrag = useCallback(() => {
    dragStateRef.current = INITIAL_CLIP_DRAG_STATE;
    setIsDraggingClip(false);
  }, []);

  const handleClipPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (toolMode !== "select") return false;

    const point = screenToProject(e.clientX, e.clientY);
    if (!point) return false;

    const hitClip = hitTestClipAtPoint(point);
    if (!hitClip || hitClip.type === "audio") return false;

    saveToHistory();
    selectClip(hitClip.id, false);
    dragStateRef.current = {
      clipId: hitClip.id,
      pointerStart: point,
      clipStart: resolveClipPositionAtTimelineTime(hitClip, currentTimeRef.current),
      clipSnapshot: hitClip,
    };
    setIsDraggingClip(true);
    return true;
  }, [toolMode, screenToProject, hitTestClipAtPoint, saveToHistory, selectClip, currentTimeRef]);

  const handleClipPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (!isDraggingClip || !dragStateRef.current.clipId) return false;

    const point = screenToProject(e.clientX, e.clientY);
    if (!point) return true;

    const dragState = dragStateRef.current;
    const clipId = dragState.clipId;
    if (!clipId) return true;
    const dx = point.x - dragState.pointerStart.x;
    const dy = point.y - dragState.pointerStart.y;
    const clipSnapshot = dragState.clipSnapshot;
    if (!clipSnapshot) return true;
    const nextPosition = {
      x: dragState.clipStart.x + dx,
      y: dragState.clipStart.y + dy,
    };
    const hasPositionAnimation = getClipPositionKeyframes(clipSnapshot).length > 0;
    const shouldUsePositionKeyframe = autoKeyframeEnabled || hasPositionAnimation;
    if (shouldUsePositionKeyframe) {
      updateClip(
        clipId,
        upsertClipPositionKeyframeAtTimelineTime(
          clipSnapshot,
          currentTimeRef.current,
          nextPosition
        )
      );
    } else {
      updateClip(clipId, { position: nextPosition });
    }
    scheduleRender();
    return true;
  }, [isDraggingClip, screenToProject, autoKeyframeEnabled, updateClip, currentTimeRef, scheduleRender]);

  return {
    isDraggingClip,
    handleClipPointerDown,
    handleClipPointerMove,
    handleClipPointerUp: resetClipDrag,
  };
}
