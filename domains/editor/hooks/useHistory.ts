"use client";

import { useCallback, useRef, RefObject } from "react";

// ============================================
// Types
// ============================================

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
  historyRef: RefObject<ImageData[]>;
  historyIndexRef: RefObject<number>;
}

// ============================================
// Hook Implementation
// ============================================

export function useHistory(options: UseHistoryOptions): UseHistoryReturn {
  const { maxHistory = 50, editCanvasRef } = options;

  const historyRef = useRef<ImageData[]>([]);
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

    // Save current state
    const imageData = ctx.getImageData(0, 0, editCanvas.width, editCanvas.height);
    historyRef.current.push(imageData);

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
      const imageData = historyRef.current[historyIndexRef.current];
      ctx.putImageData(imageData, 0, 0);
    } else if (historyIndexRef.current === 0) {
      // Undo to initial blank state
      historyIndexRef.current = -1;
      ctx.clearRect(0, 0, editCanvas.width, editCanvas.height);
    }
  }, [editCanvasRef]);

  // Redo last undone edit
  const redo = useCallback(() => {
    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const imageData = historyRef.current[historyIndexRef.current];
      ctx.putImageData(imageData, 0, 0);
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
