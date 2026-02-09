"use client";

import { useEffect, useRef } from "react";

export interface DeferredPointerPending {
  pointerId: number;
  clientX: number;
  clientY: number;
}

export interface DeferredPointerContext<TPending extends DeferredPointerPending> {
  pending: TPending;
  event: PointerEvent;
  startClientX: number;
  startClientY: number;
  deltaXFromStart: number;
  deltaYFromStart: number;
  absDeltaX: number;
  absDeltaY: number;
}

interface UseDeferredPointerGestureOptions<TPending extends DeferredPointerPending> {
  pending: TPending | null;
  thresholdPx: number;
  longPressMs?: number;
  shouldStartLongPress?: (pending: TPending) => boolean;
  onResolve?: (context: DeferredPointerContext<TPending>) => void;
  onMoveResolved?: (context: DeferredPointerContext<TPending>) => void;
  onLongPress?: (pending: TPending) => void;
  onTap?: (pending: TPending) => void;
  onEnd?: (pending: TPending, event: PointerEvent) => void;
}

/**
 * Resolves a pointer gesture into either:
 * - tap (no threshold-crossing movement)
 * - resolved move (threshold crossed)
 * - long-press (optional timer before threshold crossing)
 */
export function useDeferredPointerGesture<TPending extends DeferredPointerPending>(
  options: UseDeferredPointerGestureOptions<TPending>
) {
  const callbacksRef = useRef({
    onResolve: options.onResolve,
    onMoveResolved: options.onMoveResolved,
    onLongPress: options.onLongPress,
    onTap: options.onTap,
    onEnd: options.onEnd,
    shouldStartLongPress: options.shouldStartLongPress,
  });
  callbacksRef.current = {
    onResolve: options.onResolve,
    onMoveResolved: options.onMoveResolved,
    onLongPress: options.onLongPress,
    onTap: options.onTap,
    onEnd: options.onEnd,
    shouldStartLongPress: options.shouldStartLongPress,
  };

  useEffect(() => {
    const pending = options.pending;
    if (!pending) return;

    let resolved = false;
    let resolvedByMove = false;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    const shouldUseLongPress =
      typeof options.longPressMs === "number" &&
      options.longPressMs > 0 &&
      !!callbacksRef.current.onLongPress &&
      (callbacksRef.current.shouldStartLongPress
        ? callbacksRef.current.shouldStartLongPress(pending)
        : true);

    if (shouldUseLongPress) {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (resolved) return;
        resolved = true;
        resolvedByMove = false;
        callbacksRef.current.onLongPress?.(pending);
      }, options.longPressMs);
    }

    const clearLongPressTimer = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const handleMove = (event: PointerEvent) => {
      if (event.pointerId !== pending.pointerId) return;

      const deltaXFromStart = event.clientX - pending.clientX;
      const deltaYFromStart = event.clientY - pending.clientY;
      const absDeltaX = Math.abs(deltaXFromStart);
      const absDeltaY = Math.abs(deltaYFromStart);

      const context: DeferredPointerContext<TPending> = {
        pending,
        event,
        startClientX: pending.clientX,
        startClientY: pending.clientY,
        deltaXFromStart,
        deltaYFromStart,
        absDeltaX,
        absDeltaY,
      };

      if (!resolved && (absDeltaX >= options.thresholdPx || absDeltaY >= options.thresholdPx)) {
        resolved = true;
        resolvedByMove = true;
        clearLongPressTimer();
        callbacksRef.current.onResolve?.(context);
      }

      if (resolvedByMove) {
        callbacksRef.current.onMoveResolved?.(context);
      }
    };

    const handleUp = (event: PointerEvent) => {
      if (event.pointerId !== pending.pointerId) return;
      clearLongPressTimer();
      if (!resolved) {
        callbacksRef.current.onTap?.(pending);
      }
      callbacksRef.current.onEnd?.(pending, event);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleUp);

    return () => {
      clearLongPressTimer();
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleUp);
    };
  }, [options.pending, options.thresholdPx, options.longPressMs]);
}
