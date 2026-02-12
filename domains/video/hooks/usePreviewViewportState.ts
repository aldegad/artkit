"use client";

import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";
import type { PreviewTransformState, PreviewViewportAPI } from "../contexts/VideoRefsContext";

interface UsePreviewViewportStateResult {
  previewTransformState: PreviewTransformState;
  previewZoom: number;
  setPreviewZoom: (zoomOrFn: number | ((z: number) => number)) => void;
  handlePreviewFit: () => void;
}

const DEFAULT_PREVIEW_TRANSFORM_STATE: PreviewTransformState = {
  isActive: false,
  clipId: null,
  aspectRatio: "free",
};

function subscribeWhenReady<T>(
  previewViewportRef: RefObject<PreviewViewportAPI | null>,
  subscribe: (api: PreviewViewportAPI, setState: (value: T) => void) => () => void,
  setState: (value: T) => void,
): () => void {
  let unsubscribe: (() => void) | undefined;
  let rafId: number | null = null;

  const attach = () => {
    const api = previewViewportRef.current;
    if (!api) {
      rafId = requestAnimationFrame(attach);
      return;
    }
    unsubscribe = subscribe(api, setState);
  };

  attach();
  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    unsubscribe?.();
  };
}

export function usePreviewViewportState(
  previewViewportRef: RefObject<PreviewViewportAPI | null>,
): UsePreviewViewportStateResult {
  const [previewTransformState, setPreviewTransformState] = useState<PreviewTransformState>(
    DEFAULT_PREVIEW_TRANSFORM_STATE
  );
  const [previewZoom, setPreviewZoomState] = useState(1);

  useEffect(() => {
    return subscribeWhenReady(
      previewViewportRef,
      (api, setState) => api.onTransformChange((next) => setState(next)),
      setPreviewTransformState,
    );
  }, [previewViewportRef]);

  useEffect(() => {
    return subscribeWhenReady(
      previewViewportRef,
      (api, setState) => api.onZoomChange((next) => setState(next)),
      setPreviewZoomState,
    );
  }, [previewViewportRef]);

  const setPreviewZoom = useCallback((zoomOrFn: number | ((z: number) => number)) => {
    const api = previewViewportRef.current;
    if (!api) return;
    const nextZoom = typeof zoomOrFn === "function" ? zoomOrFn(api.getZoom()) : zoomOrFn;
    api.setZoom(nextZoom);
  }, [previewViewportRef]);

  const handlePreviewFit = useCallback(() => {
    previewViewportRef.current?.fitToContainer();
  }, [previewViewportRef]);

  return {
    previewTransformState,
    previewZoom,
    setPreviewZoom,
    handlePreviewFit,
  };
}
