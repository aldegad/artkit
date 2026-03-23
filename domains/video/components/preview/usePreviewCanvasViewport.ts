"use client";

import { useCallback, useRef } from "react";
import { PREVIEW } from "../../constants";
import { useCanvasViewport } from "@/shared/hooks/useCanvasViewport";
import { useViewportZoomTool } from "@/shared/hooks";
import { safeSetPointerCapture } from "@/shared/utils";
import { PREVIEW_VIEWPORT_CONFIG } from "./previewCanvasConfig";

interface UsePreviewCanvasViewportParams {
  previewContainerRef: React.RefObject<HTMLDivElement | null>;
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  projectCanvasSize: { width: number; height: number };
  scheduleRender: () => void;
}

export function usePreviewCanvasViewport(params: UsePreviewCanvasViewportParams) {
  const isPanningRef = useRef(false);
  const viewport = useCanvasViewport({
    containerRef: params.previewContainerRef,
    canvasRef: params.previewCanvasRef,
    contentSize: params.projectCanvasSize,
    config: PREVIEW_VIEWPORT_CONFIG,
    fitOnMount: true,
    fitPadding: PREVIEW.FIT_PADDING,
    enableWheel: true,
    enablePinch: true,
    coordinateSpace: "container",
  });
  const { zoom: viewportZoom, baseScale: viewportBaseScale } = viewport.useReactSync(200);
  const zoomPercent = Math.round((viewportBaseScale > 0 ? viewportZoom * viewportBaseScale : viewportZoom) * 100);
  const {
    onViewportChange,
    wheelRef,
    pinchRef,
    startPanDrag,
    updatePanDrag,
    endPanDrag,
    fitToContainer,
    setZoom,
    getZoom,
    setPan,
    getPan,
    setBaseScale,
    getTransform,
    getRenderOffset,
    getEffectiveScale,
    screenToContent,
    contentToScreen,
  } = viewport;

  const containerRefCallback = useCallback((el: HTMLDivElement | null) => {
    params.previewContainerRef.current = el;
    wheelRef(el);
    pinchRef(el);
  }, [params.previewContainerRef, pinchRef, wheelRef]);

  const { zoomAtClientPoint } = useViewportZoomTool({
    viewportRef: params.previewContainerRef,
    getZoom,
    getPan,
    setZoom,
    setPan,
    minZoom: PREVIEW.MIN_ZOOM,
    maxZoom: PREVIEW.MAX_ZOOM,
    zoomInFactor: PREVIEW.ZOOM_STEP_IN,
    zoomOutFactor: PREVIEW.ZOOM_STEP_OUT,
    onZoom: params.scheduleRender,
  });

  const preventAndCapturePointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    safeSetPointerCapture(e.currentTarget, e.pointerId);
  }, []);

  const startPanDragFromPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    preventAndCapturePointer(e);
    startPanDrag({ x: e.clientX, y: e.clientY });
    isPanningRef.current = true;
  }, [preventAndCapturePointer, startPanDrag]);

  const stopPanDrag = useCallback(() => {
    if (!isPanningRef.current) return;
    endPanDrag();
    isPanningRef.current = false;
  }, [endPanDrag]);

  return {
    containerRefCallback,
    contentToScreen,
    fitToContainer,
    getEffectiveScale,
    getPan,
    getRenderOffset,
    getTransform,
    getZoom,
    isPanningRef,
    onViewportChange,
    preventAndCapturePointer,
    screenToContent,
    setBaseScale,
    setPan,
    setZoom,
    startPanDragFromPointer,
    stopPanDrag,
    updatePanDrag,
    zoomAtClientPoint,
    zoomPercent,
  };
}
