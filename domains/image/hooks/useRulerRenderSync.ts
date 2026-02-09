"use client";

import { useEffect } from "react";

interface UseRulerRenderSyncOptions {
  showRulers: boolean;
  requestRender: () => void;
}

export function useRulerRenderSync(options: UseRulerRenderSyncOptions): void {
  const { showRulers, requestRender } = options;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      requestRender();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [showRulers, requestRender]);
}
