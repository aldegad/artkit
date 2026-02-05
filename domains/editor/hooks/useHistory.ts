"use client";

import { useCallback, useRef, RefObject } from "react";

// ============================================
// Types
// ============================================

interface HistoryEntry {
  imageData: ImageData;
  width: number;
  height: number;
}

interface UseHistoryOptions {
  maxHistory?: number;
  editCanvasRef: RefObject<HTMLCanvasElement | null>;
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
  const { maxHistory = 50, editCanvasRef } = options;

  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef<number>(-1);

  // Clear history
  const clearHistory = useCallback(() => {
    historyRef.current = [];
    historyIndexRef.current = -1;
  }, []);

  // Save current edit canvas state to history
  const saveToHistory = useCallback(() => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    // Remove any future states if we're not at the end
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }

    // Save current state with canvas dimensions
    const imageData = ctx.getImageData(0, 0, editCanvas.width, editCanvas.height);
    const entry: HistoryEntry = {
      imageData,
      width: editCanvas.width,
      height: editCanvas.height,
    };
    historyRef.current.push(entry);

    // Limit history size
    if (historyRef.current.length > maxHistory) {
      historyRef.current.shift();
    } else {
      historyIndexRef.current++;
    }
  }, [editCanvasRef, maxHistory]);

  // Undo last edit
  const undo = useCallback(() => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const entry = historyRef.current[historyIndexRef.current];
      // Restore canvas size if changed
      if (editCanvas.width !== entry.width || editCanvas.height !== entry.height) {
        editCanvas.width = entry.width;
        editCanvas.height = entry.height;
      }
      ctx.putImageData(entry.imageData, 0, 0);
    } else if (historyIndexRef.current === 0 && historyRef.current.length > 0) {
      // Restore to the first saved state (before any edits in this session)
      const entry = historyRef.current[0];
      historyIndexRef.current = -1;
      // Restore canvas size
      if (editCanvas.width !== entry.width || editCanvas.height !== entry.height) {
        editCanvas.width = entry.width;
        editCanvas.height = entry.height;
      }
      ctx.putImageData(entry.imageData, 0, 0);
    }
  }, [editCanvasRef]);

  // Redo last undone edit
  const redo = useCallback(() => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const entry = historyRef.current[historyIndexRef.current];
      // Restore canvas size if changed
      if (editCanvas.width !== entry.width || editCanvas.height !== entry.height) {
        editCanvas.width = entry.width;
        editCanvas.height = entry.height;
      }
      ctx.putImageData(entry.imageData, 0, 0);
    }
  }, [editCanvasRef]);

  // Check if undo is available
  const canUndo = useCallback(() => {
    return historyIndexRef.current >= 0;
  }, []);

  // Check if redo is available
  const canRedo = useCallback(() => {
    return historyIndexRef.current < historyRef.current.length - 1;
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
