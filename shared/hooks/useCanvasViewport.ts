"use client";

import { useRef, useCallback, useEffect, useState, RefObject } from "react";
import { Point, Size } from "../types";
import { ViewportEmitter, ViewportState } from "../utils/viewportEmitter";
import {
  ViewportConfig,
  ViewportTransform,
  DEFAULT_VIEWPORT_CONFIG,
  screenToContent,
  contentToCanvas,
  calculateRenderOffset,
  zoomAtPoint,
  clampZoom,
  calculateFitScale,
  getTouchDistance,
  getTouchCenter,
} from "../utils/canvasViewport";

// ============================================
// Types
// ============================================

export interface UseCanvasViewportOptions {
  containerRef: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  contentSize: Size;
  config?: Partial<ViewportConfig>;
  fitOnMount?: boolean;
  fitMaxScale?: number;
  fitPadding?: number;
  initial?: Partial<ViewportTransform>;
  enableWheel?: boolean;
  enablePinch?: boolean;
  // Coordinate math space for screen/content transforms and render offset.
  // `canvas` uses canvas.width/height (default), `container` uses CSS client size.
  coordinateSpace?: "canvas" | "container";
}

export interface UseCanvasViewportReturn {
  // Ref-backed synchronous reads
  getTransform: () => ViewportTransform;
  getZoom: () => number;
  getPan: () => Point;
  getBaseScale: () => number;
  getEffectiveScale: () => number;

  // Coordinate transforms (using current ref values)
  screenToContent: (screenPos: Point) => Point;
  contentToScreen: (contentPos: Point) => Point;
  getRenderOffset: () => Point;

  // Imperative controls
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  setBaseScale: (scale: number) => void;
  updateTransform: (partial: Partial<ViewportTransform>) => void;
  fitToContainer: (padding?: number, maxScale?: number) => void;
  resetView: () => void;

  // Event subscription
  emitter: ViewportEmitter;
  onViewportChange: (
    callback: (state: ViewportState) => void,
  ) => () => void;

  // DOM event binding
  wheelRef: (el: HTMLElement | null) => void;
  pinchRef: (el: HTMLElement | null) => void;

  // Pan drag handlers (for hand tool / space+drag)
  startPanDrag: (screenPos: Point) => void;
  updatePanDrag: (screenPos: Point) => void;
  endPanDrag: () => void;
  isPanDragging: () => boolean;

  // UI sync (throttled React state for zoom% display, etc.)
  useReactSync: (throttleMs?: number) => {
    zoom: number;
    pan: Point;
    baseScale: number;
  };
}

// ============================================
// Hook Implementation
// ============================================

export function useCanvasViewport(
  options: UseCanvasViewportOptions,
): UseCanvasViewportReturn {
  const {
    containerRef,
    canvasRef,
    contentSize,
    config: configOverride,
    fitOnMount = false,
    fitMaxScale = 1,
    fitPadding = 0,
    initial,
    enableWheel = true,
    enablePinch = true,
    coordinateSpace = "canvas",
  } = options;

  const config: ViewportConfig = {
    ...DEFAULT_VIEWPORT_CONFIG,
    ...configOverride,
  };

  // ---- Ref-based state (source of truth, no React re-renders) ----
  const transformRef = useRef<ViewportTransform>({
    zoom: initial?.zoom ?? 1,
    pan: initial?.pan ?? { x: 0, y: 0 },
    baseScale: initial?.baseScale ?? 1,
  });

  const emitterRef = useRef(new ViewportEmitter());

  // Pan drag state
  const panDragRef = useRef<{
    active: boolean;
    lastPos: Point;
  }>({ active: false, lastPos: { x: 0, y: 0 } });

  // Pinch state
  const pinchRef = useRef<{
    active: boolean;
    lastDistance: number;
    lastCenter: Point;
  }>({ active: false, lastDistance: 0, lastCenter: { x: 0, y: 0 } });

  // Element refs for cleanup
  const wheelElRef = useRef<HTMLElement | null>(null);
  const pinchElRef = useRef<HTMLElement | null>(null);

  // ---- Helpers ----

  const emit = useCallback(() => {
    const t = transformRef.current;
    emitterRef.current.emit({
      zoom: t.zoom,
      pan: t.pan,
      baseScale: t.baseScale,
    });
  }, []);

  // Use container for zoom/pan coordinate calculations.
  // This handles both fixed-canvas (editor) and resizing-canvas (sprite preview) models.
  const getContainerRect = useCallback((): DOMRect | null => {
    return containerRef.current?.getBoundingClientRect() ?? null;
  }, [containerRef]);

  const getContainerPixelSize = useCallback((): Size => {
    const el = containerRef.current;
    if (!el) return { width: 0, height: 0 };
    return { width: el.clientWidth, height: el.clientHeight };
  }, [containerRef]);

  // Pixel size used by viewport math (coordinates/render offset).
  const getMathPixelSize = useCallback((): Size => {
    if (coordinateSpace === "container") {
      return getContainerPixelSize();
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      // Fallback to container size
      return getContainerPixelSize();
    }
    return { width: canvas.width, height: canvas.height };
  }, [coordinateSpace, canvasRef, getContainerPixelSize]);

  // ---- Public: reads ----

  const getTransform = useCallback(() => transformRef.current, []);
  const getZoom = useCallback(() => transformRef.current.zoom, []);
  const getPan = useCallback(() => transformRef.current.pan, []);
  const getBaseScale = useCallback(() => transformRef.current.baseScale, []);
  const getEffectiveScale = useCallback(
    () => transformRef.current.baseScale * transformRef.current.zoom,
    [],
  );

  // ---- Public: coordinate transforms ----

  const screenToContentFn = useCallback(
    (screenPos: Point): Point => {
      const rect = getContainerRect();
      if (!rect) return { x: 0, y: 0 };
      const canvasPixelSize = getMathPixelSize();
      return screenToContent(
        screenPos,
        rect,
        canvasPixelSize,
        transformRef.current,
        contentSize,
        config.origin,
      );
    },
    // Use primitive values to avoid new-object-per-render instability
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getContainerRect, getMathPixelSize, contentSize.width, contentSize.height, config.origin],
  );

  const contentToScreenFn = useCallback(
    (contentPos: Point): Point => {
      const canvasPixelSize = getMathPixelSize();
      return contentToCanvas(
        contentPos,
        canvasPixelSize,
        transformRef.current,
        contentSize,
        config.origin,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getMathPixelSize, contentSize.width, contentSize.height, config.origin],
  );

  const getRenderOffsetFn = useCallback((): Point => {
    const canvasPixelSize = getMathPixelSize();
    return calculateRenderOffset(
      canvasPixelSize,
      contentSize,
      transformRef.current,
      config.origin,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getMathPixelSize, contentSize.width, contentSize.height, config.origin]);

  // ---- Public: imperative controls ----

  const setZoomFn = useCallback(
    (zoom: number) => {
      transformRef.current = {
        ...transformRef.current,
        zoom: clampZoom(zoom, config.minZoom, config.maxZoom),
      };
      emit();
    },
    [config.minZoom, config.maxZoom, emit],
  );

  const setPanFn = useCallback(
    (pan: Point) => {
      transformRef.current = { ...transformRef.current, pan };
      emit();
    },
    [emit],
  );

  const setBaseScaleFn = useCallback(
    (baseScale: number) => {
      transformRef.current = { ...transformRef.current, baseScale };
      emit();
    },
    [emit],
  );

  const updateTransform = useCallback(
    (partial: Partial<ViewportTransform>) => {
      transformRef.current = { ...transformRef.current, ...partial };
      if (partial.zoom !== undefined) {
        transformRef.current.zoom = clampZoom(
          transformRef.current.zoom,
          config.minZoom,
          config.maxZoom,
        );
      }
      emit();
    },
    [config.minZoom, config.maxZoom, emit],
  );

  const fitToContainer = useCallback(
    (padding?: number, maxScale?: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const p = padding ?? fitPadding;
      const ms = maxScale ?? fitMaxScale;
      const baseScale = calculateFitScale(
        { width: rect.width, height: rect.height },
        contentSize,
        p,
        ms,
      );
      transformRef.current = {
        zoom: 1,
        pan: { x: 0, y: 0 },
        baseScale,
      };
      emit();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [containerRef, contentSize.width, contentSize.height, fitPadding, fitMaxScale, emit],
  );

  const resetView = useCallback(() => {
    transformRef.current = {
      zoom: 1,
      pan: { x: 0, y: 0 },
      baseScale: transformRef.current.baseScale,
    };
    emit();
  }, [emit]);

  // ---- Wheel zoom ----

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const containerPixelSize: Size = {
        width: rect.width,
        height: rect.height,
      };

      // Cursor position relative to container (no DPI scaling for container)
      const cursorPos: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      const current = transformRef.current;
      const delta = e.deltaY > 0
        ? 1 - config.wheelZoomFactor
        : 1 + config.wheelZoomFactor;
      const newZoom = clampZoom(
        current.zoom * delta,
        config.minZoom,
        config.maxZoom,
      );

      if (newZoom === current.zoom) return;

      const result = zoomAtPoint(
        cursorPos,
        current,
        newZoom,
        config.origin,
        containerPixelSize,
      );

      transformRef.current = {
        ...current,
        zoom: result.zoom,
        pan: result.pan,
      };
      emit();
    },
    [
      containerRef,
      config.wheelZoomFactor,
      config.minZoom,
      config.maxZoom,
      config.origin,
      emit,
    ],
  );

  // Wheel ref callback
  const wheelRef = useCallback(
    (el: HTMLElement | null) => {
      // Cleanup previous
      if (wheelElRef.current) {
        wheelElRef.current.removeEventListener("wheel", handleWheel);
      }
      wheelElRef.current = el;
      if (el && enableWheel) {
        el.addEventListener("wheel", handleWheel, { passive: false });
      }
    },
    [handleWheel, enableWheel],
  );

  // Cleanup wheel on unmount
  useEffect(() => {
    return () => {
      if (wheelElRef.current) {
        wheelElRef.current.removeEventListener("wheel", handleWheel);
      }
    };
  }, [handleWheel]);

  // ---- Pinch zoom ----

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const containerSize: Size = {
          width: rect.width,
          height: rect.height,
        };

        pinchRef.current = {
          active: true,
          lastDistance: getTouchDistance(e.touches),
          lastCenter: getTouchCenter(e.touches, rect, containerSize),
        };
      }
    },
    [containerRef],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!pinchRef.current.active || e.touches.length !== 2) return;
      e.preventDefault();

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const containerSize: Size = {
        width: rect.width,
        height: rect.height,
      };

      const newDistance = getTouchDistance(e.touches);
      const newCenter = getTouchCenter(e.touches, rect, containerSize);

      const current = transformRef.current;
      const zoomDelta = newDistance / pinchRef.current.lastDistance;
      const newZoom = clampZoom(
        current.zoom * zoomDelta,
        config.minZoom,
        config.maxZoom,
      );

      // Zoom at pinch center
      const result = zoomAtPoint(
        pinchRef.current.lastCenter,
        current,
        newZoom,
        config.origin,
        containerSize,
      );

      // Two-finger pan
      const panDeltaX = newCenter.x - pinchRef.current.lastCenter.x;
      const panDeltaY = newCenter.y - pinchRef.current.lastCenter.y;

      transformRef.current = {
        ...current,
        zoom: result.zoom,
        pan: {
          x: result.pan.x + panDeltaX,
          y: result.pan.y + panDeltaY,
        },
      };

      pinchRef.current.lastDistance = newDistance;
      pinchRef.current.lastCenter = newCenter;

      emit();
    },
    [containerRef, config.minZoom, config.maxZoom, config.origin, emit],
  );

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (e.touches.length < 2) {
      pinchRef.current.active = false;
    }
  }, []);

  // Pinch ref callback
  const pinchRefCallback = useCallback(
    (el: HTMLElement | null) => {
      if (pinchElRef.current) {
        pinchElRef.current.removeEventListener("touchstart", handleTouchStart);
        pinchElRef.current.removeEventListener("touchmove", handleTouchMove);
        pinchElRef.current.removeEventListener("touchend", handleTouchEnd);
      }
      pinchElRef.current = el;
      if (el && enablePinch) {
        el.addEventListener("touchstart", handleTouchStart, {
          passive: false,
        });
        el.addEventListener("touchmove", handleTouchMove, { passive: false });
        el.addEventListener("touchend", handleTouchEnd);
      }
    },
    [handleTouchStart, handleTouchMove, handleTouchEnd, enablePinch],
  );

  // Cleanup pinch on unmount
  useEffect(() => {
    return () => {
      if (pinchElRef.current) {
        pinchElRef.current.removeEventListener(
          "touchstart",
          handleTouchStart,
        );
        pinchElRef.current.removeEventListener("touchmove", handleTouchMove);
        pinchElRef.current.removeEventListener("touchend", handleTouchEnd);
      }
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // ---- Pan drag (hand tool / space+drag) ----

  const startPanDrag = useCallback((screenPos: Point) => {
    panDragRef.current = { active: true, lastPos: screenPos };
  }, []);

  const updatePanDrag = useCallback(
    (screenPos: Point) => {
      if (!panDragRef.current.active) return;
      const dx = screenPos.x - panDragRef.current.lastPos.x;
      const dy = screenPos.y - panDragRef.current.lastPos.y;
      panDragRef.current.lastPos = screenPos;

      transformRef.current = {
        ...transformRef.current,
        pan: {
          x: transformRef.current.pan.x + dx,
          y: transformRef.current.pan.y + dy,
        },
      };
      emit();
    },
    [emit],
  );

  const endPanDrag = useCallback(() => {
    panDragRef.current.active = false;
  }, []);

  const isPanDragging = useCallback(
    () => panDragRef.current.active,
    [],
  );

  // ---- Fit on mount ----

  useEffect(() => {
    if (fitOnMount && contentSize.width > 0 && contentSize.height > 0) {
      fitToContainer();
    }
  }, [fitOnMount, contentSize.width, contentSize.height, fitToContainer]);

  // ---- Event subscription ----

  const onViewportChange = useCallback(
    (callback: (state: ViewportState) => void): (() => void) => {
      return emitterRef.current.subscribe(callback);
    },
    [],
  );

  // ---- useReactSync sub-hook ----
  // Returns throttled React state for UI components (zoom display, etc.)

  const useReactSync = useCallback(
    (throttleMs: number = 100) => {
      return useReactSyncImpl(emitterRef.current, transformRef, throttleMs);
    },
    [],
  );

  return {
    getTransform,
    getZoom,
    getPan,
    getBaseScale,
    getEffectiveScale,

    screenToContent: screenToContentFn,
    contentToScreen: contentToScreenFn,
    getRenderOffset: getRenderOffsetFn,

    setZoom: setZoomFn,
    setPan: setPanFn,
    setBaseScale: setBaseScaleFn,
    updateTransform,
    fitToContainer,
    resetView,

    emitter: emitterRef.current,
    onViewportChange,

    wheelRef,
    pinchRef: pinchRefCallback,

    startPanDrag,
    updatePanDrag,
    endPanDrag,
    isPanDragging,

    useReactSync,
  };
}

// ============================================
// useReactSync implementation (internal)
// ============================================

function useReactSyncImpl(
  emitter: ViewportEmitter,
  transformRef: React.RefObject<ViewportTransform>,
  throttleMs: number,
): { zoom: number; pan: Point; baseScale: number } {
  const [syncState, setSyncState] = useState(() => ({
    zoom: transformRef.current.zoom,
    pan: transformRef.current.pan,
    baseScale: transformRef.current.baseScale,
  }));

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let latestState: ViewportState | null = null;

    const unsub = emitter.subscribe((state) => {
      latestState = state;
      if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          timeoutId = null;
          if (latestState) {
            setSyncState({
              zoom: latestState.zoom,
              pan: latestState.pan,
              baseScale: latestState.baseScale,
            });
          }
        }, throttleMs);
      }
    });

    return () => {
      unsub();
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [emitter, throttleMs]);

  return syncState;
}
