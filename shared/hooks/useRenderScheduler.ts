"use client";

import { useRef, useEffect, useCallback, RefObject } from "react";

// ============================================
// useRenderScheduler
// ============================================

/**
 * RAF-based render scheduler. Replaces useEffect-driven canvas rendering.
 *
 * - requestRender() sets dirty flag + schedules RAF (auto-batching)
 * - Built-in ResizeObserver triggers render on container resize
 * - Cleanup: cancelAnimationFrame + observer disconnect
 */
export function useRenderScheduler(
  containerRef: RefObject<HTMLElement | null>,
): {
  requestRender: () => void;
  setRenderFn: (fn: () => void) => void;
} {
  const rafIdRef = useRef<number | null>(null);
  const renderFnRef = useRef<(() => void) | null>(null);

  const requestRender = useCallback(() => {
    if (rafIdRef.current !== null) return; // already scheduled
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      renderFnRef.current?.();
    });
  }, []);

  const setRenderFn = useCallback((fn: () => void) => {
    renderFnRef.current = fn;
  }, []);

  // ResizeObserver: trigger render on container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      requestRender();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [containerRef, requestRender]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  return { requestRender, setRenderFn };
}
