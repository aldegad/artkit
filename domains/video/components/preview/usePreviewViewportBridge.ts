"use client";

import { useEffect, useRef, type RefObject } from "react";
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
  onViewportChange: (cb: (state: { zoom: number }) => void) => () => void;
  getZoom: () => number;
  setZoom: (zoom: number) => void;
  fitToContainer: () => void;
  transformTool: TransformToolLike;
  captureCompositeFrame: (time?: number) => Promise<Blob | null>;
}

export function usePreviewViewportBridge({
  previewViewportRef,
  onViewportChange,
  getZoom,
  setZoom,
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

  useEffect(() => {
    previewViewportRef.current = {
      zoomIn: () => setZoom(getZoom() * 1.25),
      zoomOut: () => setZoom(getZoom() / 1.25),
      fitToContainer,
      getZoom,
      setZoom,
      onZoomChange: (cb) => onViewportChange((state) => cb(state.zoom)),
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
    getZoom,
    onViewportChange,
    previewViewportRef,
    setZoom,
    transformTool,
  ]);
}
