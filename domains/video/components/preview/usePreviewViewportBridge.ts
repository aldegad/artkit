"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { AspectRatio } from "@/shared/types/aspectRatio";
import type { PreviewViewportAPI, PreviewTransformState } from "../../contexts/VideoRefsContext";

interface TransformToolLike {
  state: {
    isActive: boolean;
    clipId: string | null;
    aspectRatio: AspectRatio;
  };
  startTransformForSelection: () => boolean;
  applyTransform: () => void;
  cancelTransform: () => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  nudgeTransform: (dx: number, dy: number) => boolean;
}

interface UsePreviewViewportBridgeOptions {
  previewViewportRef: RefObject<PreviewViewportAPI | null>;
  onViewportChange: (cb: (state: { zoom: number; baseScale?: number }) => void) => () => void;
  getZoom: () => number;
  setZoom: (zoom: number) => void;
  getEffectiveScale: () => number;
  fitToContainer: () => void;
  transformTool: TransformToolLike;
  captureCompositeFrame: (time?: number) => Promise<Blob | null>;
}

export function usePreviewViewportBridge({
  previewViewportRef,
  onViewportChange,
  getZoom,
  setZoom,
  getEffectiveScale,
  fitToContainer,
  transformTool,
  captureCompositeFrame,
}: UsePreviewViewportBridgeOptions) {
  const transformListenersRef = useRef(new Set<(state: PreviewTransformState) => void>());
  const transformPublicStateRef = useRef<PreviewTransformState>({
    isActive: false,
    clipId: null,
    aspectRatio: "free",
  });

  useEffect(() => {
    transformPublicStateRef.current = {
      isActive: transformTool.state.isActive,
      clipId: transformTool.state.clipId,
      aspectRatio: transformTool.state.aspectRatio,
    };
    for (const listener of transformListenersRef.current) {
      listener(transformPublicStateRef.current);
    }
  }, [
    transformTool.state.isActive,
    transformTool.state.clipId,
    transformTool.state.aspectRatio,
  ]);

  const setDisplayZoom = useCallback((nextDisplayZoom: number) => {
    if (!Number.isFinite(nextDisplayZoom) || nextDisplayZoom <= 0) return;

    const currentDisplayZoom = getEffectiveScale();
    const currentRelativeZoom = getZoom();

    if (
      !Number.isFinite(currentDisplayZoom) ||
      currentDisplayZoom <= 0 ||
      !Number.isFinite(currentRelativeZoom) ||
      currentRelativeZoom <= 0
    ) {
      setZoom(nextDisplayZoom);
      return;
    }

    // Convert display-scale target back into viewport-relative zoom.
    setZoom((currentRelativeZoom * nextDisplayZoom) / currentDisplayZoom);
  }, [getEffectiveScale, getZoom, setZoom]);

  useEffect(() => {
    previewViewportRef.current = {
      zoomIn: () => setDisplayZoom(getEffectiveScale() * 1.25),
      zoomOut: () => setDisplayZoom(getEffectiveScale() / 1.25),
      fitToContainer,
      getZoom: getEffectiveScale,
      setZoom: setDisplayZoom,
      onZoomChange: (cb) => onViewportChange((state) => cb(state.zoom * (state.baseScale ?? 1))),
      startTransformForSelection: () => transformTool.startTransformForSelection(),
      applyTransform: () => transformTool.applyTransform(),
      cancelTransform: () => transformTool.cancelTransform(),
      setTransformAspectRatio: (ratio) => transformTool.setAspectRatio(ratio),
      nudgeTransform: (dx, dy) => transformTool.nudgeTransform(dx, dy),
      captureCompositeFrame: (time) => captureCompositeFrame(time),
      getTransformState: () => transformPublicStateRef.current,
      onTransformChange: (cb) => {
        transformListenersRef.current.add(cb);
        cb(transformPublicStateRef.current);
        return () => {
          transformListenersRef.current.delete(cb);
        };
      },
    };

    return () => {
      previewViewportRef.current = null;
    };
  }, [
    captureCompositeFrame,
    fitToContainer,
    getEffectiveScale,
    getZoom,
    onViewportChange,
    previewViewportRef,
    setDisplayZoom,
    transformTool,
  ]);
}
