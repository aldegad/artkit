"use client";

import { useCallback, useRef, RefObject } from "react";

// ============================================
// Types
// ============================================

interface LegacyHistoryEntry {
  type: "legacy";
  imageData: ImageData;
  width: number;
  height: number;
}

interface AdapterHistoryEntry<TState = unknown> {
  type: "adapter";
  state: TState;
}

type HistoryEntry<TState = unknown> = LegacyHistoryEntry | AdapterHistoryEntry<TState>;

export interface HistoryAdapter<TState = unknown> {
  captureState: () => TState | null;
  applyState: (state: TState) => void;
}

interface UseHistoryOptions {
  maxHistory?: number;
  editCanvasRef?: RefObject<HTMLCanvasElement | null>;
  historyAdapterRef?: RefObject<HistoryAdapter<any> | null>;
}

interface UseHistoryReturn {
  saveToHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
  historyRef: RefObject<HistoryEntry[]>;
  historyIndexRef: RefObject<number>;
}

// ============================================
// Hook Implementation
// ============================================

export function useHistory(options: UseHistoryOptions): UseHistoryReturn {
  const { maxHistory = 50, editCanvasRef, historyAdapterRef } = options;

  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const redoRef = useRef<HistoryEntry[]>([]);

  // Keep compatibility refs in sync with the past stack.
  const syncRefs = useCallback(() => {
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  // Capture current state from adapter if available, otherwise from active canvas.
  const captureCurrentState = useCallback((): HistoryEntry | null => {
    const adapter = historyAdapterRef?.current;
    if (adapter) {
      const state = adapter.captureState();
      if (!state) return null;
      return {
        type: "adapter",
        state,
      };
    }

    const editCanvas = editCanvasRef?.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return null;

    return {
      type: "legacy",
      imageData: ctx.getImageData(0, 0, editCanvas.width, editCanvas.height),
      width: editCanvas.width,
      height: editCanvas.height,
    };
  }, [editCanvasRef, historyAdapterRef]);

  // Restore an entry onto adapter/canvas.
  const applyEntry = useCallback(
    (entry: HistoryEntry) => {
      if (entry.type === "adapter") {
        const adapter = historyAdapterRef?.current;
        if (!adapter) return;
        adapter.applyState(entry.state);
        return;
      }

      const editCanvas = editCanvasRef?.current;
      const ctx = editCanvas?.getContext("2d");
      if (!editCanvas || !ctx) return;

      if (editCanvas.width !== entry.width || editCanvas.height !== entry.height) {
        editCanvas.width = entry.width;
        editCanvas.height = entry.height;
      }
      ctx.putImageData(entry.imageData, 0, 0);
    },
    [editCanvasRef, historyAdapterRef]
  );

  // Clear history
  const clearHistory = useCallback(() => {
    historyRef.current = [];
    redoRef.current = [];
    syncRefs();
  }, [syncRefs]);

  // Save current state to history (intended to be called BEFORE mutation).
  const saveToHistory = useCallback(() => {
    const entry = captureCurrentState();
    if (!entry) return;

    historyRef.current.push(entry);
    redoRef.current = [];

    // Limit history size
    if (historyRef.current.length > maxHistory) {
      historyRef.current.shift();
    }
    syncRefs();
  }, [captureCurrentState, maxHistory, syncRefs]);

  // Undo last mutation.
  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;

    const currentEntry = captureCurrentState();
    if (!currentEntry) return;

    const previousEntry = historyRef.current.pop();
    if (!previousEntry) return;

    redoRef.current.push(currentEntry);
    applyEntry(previousEntry);
    syncRefs();
  }, [applyEntry, captureCurrentState, syncRefs]);

  // Redo last undone mutation.
  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return;

    const currentEntry = captureCurrentState();
    if (!currentEntry) return;

    const nextEntry = redoRef.current.pop();
    if (!nextEntry) return;

    historyRef.current.push(currentEntry);
    if (historyRef.current.length > maxHistory) {
      historyRef.current.shift();
    }

    applyEntry(nextEntry);
    syncRefs();
  }, [applyEntry, captureCurrentState, maxHistory, syncRefs]);

  // Check if undo is available
  const canUndo = useCallback(() => {
    return historyRef.current.length > 0;
  }, []);

  // Check if redo is available
  const canRedo = useCallback(() => {
    return redoRef.current.length > 0;
  }, []);

  return {
    saveToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    historyRef,
    historyIndexRef,
  };
}
