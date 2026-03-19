"use client";

import { useEffect, RefObject } from "react";
import { EditorToolMode } from "../types";

interface UseTransformShortcutsOptions {
  toolMode: EditorToolMode;
  setToolMode: (mode: EditorToolMode) => void;
  activeLayerId: string | null;
  layersCount: number;
  isTransformActive: boolean;
  startTransform: () => void;
  applyTransform: () => void;
  cancelTransform: () => void;
  previousToolModeRef: RefObject<EditorToolMode | null>;
}

export function useTransformShortcuts(options: UseTransformShortcutsOptions): void {
  const {
    toolMode,
    setToolMode,
    activeLayerId,
    layersCount,
    isTransformActive,
    startTransform,
    applyTransform,
    cancelTransform,
    previousToolModeRef,
  } = options;

  useEffect(() => {
    if (toolMode === "transform" && !isTransformActive) {
      startTransform();
    }
  }, [toolMode, isTransformActive, startTransform]);

  useEffect(() => {
    const handleTransformKeys = (e: KeyboardEvent) => {
      // Ctrl+Alt+T / Cmd+Option+T: 선택된 레이어 트랜스폼. (Ctrl+T는 Chrome에서 새 탭으로 예약되어 막을 수 없음)
      const isTransformShortcut = e.code === "KeyT" && (e.metaKey || e.ctrlKey) && e.altKey;
      if (isTransformShortcut) {
        e.preventDefault();
        e.stopPropagation();
        const target = e.target as HTMLElement;
        const isInput = (
          target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        );
        if (!isInput && layersCount > 0) {
          if (toolMode !== "transform") {
            previousToolModeRef.current = toolMode;
          }
          setToolMode("transform");
        }
        return;
      }

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (!isTransformActive) return;

      if (e.code === "Enter") {
        e.preventDefault();
        applyTransform();
        if (previousToolModeRef.current) {
          setToolMode(previousToolModeRef.current);
          previousToolModeRef.current = null;
        }
      }

      if (e.code === "Escape") {
        e.preventDefault();
        cancelTransform();
        if (previousToolModeRef.current) {
          setToolMode(previousToolModeRef.current);
          previousToolModeRef.current = null;
        } else {
          setToolMode("move");
        }
      }
    };

    window.addEventListener("keydown", handleTransformKeys, { capture: true });
    return () => window.removeEventListener("keydown", handleTransformKeys, { capture: true });
  }, [
    isTransformActive,
    activeLayerId,
    layersCount,
    toolMode,
    applyTransform,
    cancelTransform,
    setToolMode,
    previousToolModeRef,
  ]);
}
