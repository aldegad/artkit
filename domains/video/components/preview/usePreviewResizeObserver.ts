"use client";

import { MutableRefObject, RefObject, useEffect } from "react";
import { Size } from "@/shared/types";
import { PREVIEW } from "../../constants";

interface UsePreviewResizeObserverOptions {
  previewContainerRef: RefObject<HTMLDivElement | null>;
  containerRectRef: MutableRefObject<{ width: number; height: number }>;
  getTransform: () => { zoom: number; pan: { x: number; y: number } };
  fitToContainer: (padding?: number) => void;
  setBaseScale: (baseScale: number) => void;
  projectCanvasSize: Size;
  renderRef: MutableRefObject<() => void>;
}

export function usePreviewResizeObserver(options: UsePreviewResizeObserverOptions) {
  const {
    previewContainerRef,
    containerRectRef,
    getTransform,
    fitToContainer,
    setBaseScale,
    projectCanvasSize,
    renderRef,
  } = options;

  // Handle resize — recalculate fit scale via viewport, then re-render.
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const updateContainerRect = (width: number, height: number) => {
      containerRectRef.current = { width, height };
    };

    const initialRect = container.getBoundingClientRect();
    updateContainerRect(initialRect.width, initialRect.height);

    const resizeObserver = new ResizeObserver((entries) => {
      const observedRect = entries[0]?.contentRect;
      const width = observedRect?.width ?? containerRectRef.current.width;
      const height = observedRect?.height ?? containerRectRef.current.height;
      updateContainerRect(width, height);

      const { zoom, pan } = getTransform();
      if (zoom === 1 && pan.x === 0 && pan.y === 0) {
        // Default view — fit to container.
        fitToContainer(PREVIEW.FIT_PADDING);
      } else {
        // User has zoomed/panned — only update baseScale.
        const padding = PREVIEW.FIT_PADDING;
        const maxW = width - padding * 2;
        const maxH = height - padding * 2;
        const pw = projectCanvasSize.width;
        const ph = projectCanvasSize.height;
        if (maxW > 0 && maxH > 0 && pw > 0 && ph > 0) {
          setBaseScale(Math.min(maxW / pw, maxH / ph));
        }
      }
      requestAnimationFrame(() => renderRef.current());
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [
    previewContainerRef,
    containerRectRef,
    getTransform,
    fitToContainer,
    setBaseScale,
    projectCanvasSize.width,
    projectCanvasSize.height,
    renderRef,
  ]);
}
