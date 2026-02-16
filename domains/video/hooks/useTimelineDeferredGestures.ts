"use client";

import type { DeferredPointerContext, DeferredPointerPending } from "@/shared/hooks";
import { useDeferredPointerGesture } from "@/shared/hooks";
import { GESTURE } from "../constants";

interface UseTimelineTouchGestureOptions<TPending extends DeferredPointerPending> {
  pending: TPending | null;
  shouldStartLongPress: (pending: TPending) => boolean;
  onLongPress: (pending: TPending) => void;
  onMoveResolved: (context: DeferredPointerContext<TPending>) => void;
  onTap: (pending: TPending) => void;
  onEnd: (pending: TPending, event: PointerEvent) => void;
}

interface UseTimelineImmediateGestureOptions<TPending extends DeferredPointerPending> {
  pending: TPending | null;
  onMoveResolved: (context: DeferredPointerContext<TPending>) => void;
  onEnd: (pending: TPending, event: PointerEvent) => void;
}

export function useTimelineTouchGesture<TPending extends DeferredPointerPending>(
  options: UseTimelineTouchGestureOptions<TPending>
) {
  useDeferredPointerGesture<TPending>({
    pending: options.pending,
    thresholdPx: GESTURE.TOUCH_GESTURE_THRESHOLD_PX,
    longPressMs: GESTURE.LONG_PRESS_MS,
    shouldStartLongPress: options.shouldStartLongPress,
    onLongPress: options.onLongPress,
    onMoveResolved: options.onMoveResolved,
    onTap: options.onTap,
    onEnd: options.onEnd,
  });
}

export function useTimelineImmediateGesture<TPending extends DeferredPointerPending>(
  options: UseTimelineImmediateGestureOptions<TPending>
) {
  useDeferredPointerGesture<TPending>({
    pending: options.pending,
    thresholdPx: 0,
    onMoveResolved: options.onMoveResolved,
    onEnd: options.onEnd,
  });
}
