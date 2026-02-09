"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { type Point } from "../types";

interface ViewportSnapshot {
  zoom: number;
  pan: Point;
  baseScale: number;
}

export interface CanvasViewportState {
  zoom: number;
  pan: Point;
  baseScale?: number;
}

export interface CanvasViewportBridgeLike {
  onViewportChange: (callback: (state: ViewportSnapshot) => void) => () => void;
  updateTransform: (partial: { zoom?: number; pan?: Point; baseScale?: number }) => void;
  wheelRef: (el: HTMLElement | null) => void;
  pinchRef: (el: HTMLElement | null) => void;
}

interface UseCanvasViewportBridgeOptions<TElement extends HTMLElement> {
  viewport: CanvasViewportBridgeLike;
  elementRef: RefObject<TElement | null>;
  externalState: CanvasViewportState;
  onViewportStateChange: (state: CanvasViewportState) => void;
  syncBaseScale?: boolean;
}

interface UseCanvasViewportBridgeReturn<TElement extends HTMLElement> {
  elementRefCallback: (element: TElement | null) => void;
}

function normalizeState(state: CanvasViewportState, syncBaseScale: boolean): CanvasViewportState {
  if (syncBaseScale) {
    return {
      zoom: state.zoom,
      pan: { ...state.pan },
      baseScale: state.baseScale ?? 1,
    };
  }

  return {
    zoom: state.zoom,
    pan: { ...state.pan },
  };
}

function isSameState(a: CanvasViewportState, b: CanvasViewportState, syncBaseScale: boolean): boolean {
  if (a.zoom !== b.zoom) return false;
  if (a.pan.x !== b.pan.x || a.pan.y !== b.pan.y) return false;
  if (syncBaseScale && (a.baseScale ?? 1) !== (b.baseScale ?? 1)) return false;
  return true;
}

export function useCanvasViewportBridge<TElement extends HTMLElement = HTMLCanvasElement>(
  options: UseCanvasViewportBridgeOptions<TElement>
): UseCanvasViewportBridgeReturn<TElement> {
  const {
    viewport,
    elementRef,
    externalState,
    onViewportStateChange,
    syncBaseScale = false,
  } = options;

  const lastSyncedRef = useRef<CanvasViewportState>(normalizeState(externalState, syncBaseScale));

  useEffect(() => {
    return viewport.onViewportChange((snapshot) => {
      const nextState = normalizeState(
        {
          zoom: snapshot.zoom,
          pan: snapshot.pan,
          baseScale: snapshot.baseScale,
        },
        syncBaseScale
      );

      if (isSameState(lastSyncedRef.current, nextState, syncBaseScale)) return;

      lastSyncedRef.current = nextState;
      onViewportStateChange(nextState);
    });
  }, [viewport, onViewportStateChange, syncBaseScale]);

  useEffect(() => {
    const nextExternal = normalizeState(externalState, syncBaseScale);
    if (isSameState(lastSyncedRef.current, nextExternal, syncBaseScale)) return;

    lastSyncedRef.current = nextExternal;
    viewport.updateTransform({
      zoom: nextExternal.zoom,
      pan: nextExternal.pan,
      ...(syncBaseScale ? { baseScale: nextExternal.baseScale ?? 1 } : {}),
    });
  }, [
    externalState.zoom,
    externalState.pan.x,
    externalState.pan.y,
    externalState.baseScale,
    viewport,
    syncBaseScale,
  ]);

  const elementRefCallback = useCallback(
    (element: TElement | null) => {
      elementRef.current = element;
      viewport.wheelRef(element);
      viewport.pinchRef(element);
    },
    [elementRef, viewport]
  );

  return {
    elementRefCallback,
  };
}

