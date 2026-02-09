"use client";

import { useEffect, useRef } from "react";
import { type Point } from "../types";

export interface PersistedCanvasViewportState {
  zoom: number;
  pan: Point;
}

interface UseCanvasViewportPersistenceOptions {
  onViewportChange: (callback: (state: PersistedCanvasViewportState) => void) => () => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  loadState: () => PersistedCanvasViewportState | null;
  saveState: (state: PersistedCanvasViewportState) => void;
  isRestoreBlocked?: boolean;
  debounceMs?: number;
  isValidState?: (state: PersistedCanvasViewportState) => boolean;
}

function defaultIsValidState(state: PersistedCanvasViewportState): boolean {
  return Number.isFinite(state.zoom)
    && state.zoom > 0
    && Number.isFinite(state.pan.x)
    && Number.isFinite(state.pan.y);
}

export function useCanvasViewportPersistence(options: UseCanvasViewportPersistenceOptions): void {
  const {
    onViewportChange,
    setZoom,
    setPan,
    loadState,
    saveState,
    isRestoreBlocked = false,
    debounceMs = 1000,
    isValidState = defaultIsValidState,
  } = options;

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onViewportChange((state) => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

      if (debounceMs <= 0) {
        saveState(state);
        return;
      }

      syncTimeoutRef.current = setTimeout(() => {
        saveState(state);
      }, debounceMs);
    });

    return () => {
      unsubscribe();
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [onViewportChange, saveState, debounceMs]);

  useEffect(() => {
    if (restoredRef.current || isRestoreBlocked) return;
    restoredRef.current = true;

    const restored = loadState();
    if (!restored || !isValidState(restored)) return;

    setZoom(restored.zoom);
    setPan(restored.pan);
  }, [isRestoreBlocked, loadState, isValidState, setZoom, setPan]);
}

