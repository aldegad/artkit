"use client";

import { useEffect } from "react";

interface UseMagicWandOutlineAnimationParams {
  hasSelection: () => boolean;
  requestRender: () => void;
}

export function useMagicWandOutlineAnimation({
  hasSelection,
  requestRender,
}: UseMagicWandOutlineAnimationParams): void {
  useEffect(() => {
    let rafId = 0;
    const animateSelectionOutline = () => {
      if (hasSelection()) {
        requestRender();
      }
      rafId = window.requestAnimationFrame(animateSelectionOutline);
    };
    rafId = window.requestAnimationFrame(animateSelectionOutline);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [hasSelection, requestRender]);
}
