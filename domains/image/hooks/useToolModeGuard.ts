"use client";

import { useCallback, useRef, useState } from "react";
import { EditorToolMode } from "../types";

interface UseToolModeGuardOptions {
  toolMode: EditorToolMode;
  setToolMode: (mode: EditorToolMode) => void;
  isTransformActive: boolean;
  cancelTransform: () => void;
  applyTransform: () => void;
}

interface UseToolModeGuardReturn {
  showTransformDiscardConfirm: boolean;
  handleToolModeChange: (mode: EditorToolMode) => void;
  handleTransformDiscardConfirm: () => void;
  handleTransformApplyAndSwitch: () => void;
  handleTransformDiscardCancel: () => void;
  previousToolModeRef: React.MutableRefObject<EditorToolMode | null>;
}

export function useToolModeGuard(options: UseToolModeGuardOptions): UseToolModeGuardReturn {
  const { toolMode, setToolMode, isTransformActive, cancelTransform, applyTransform } = options;

  const [showTransformDiscardConfirm, setShowTransformDiscardConfirm] = useState(false);
  const pendingToolModeRef = useRef<EditorToolMode | null>(null);
  const previousToolModeRef = useRef<EditorToolMode | null>(null);

  const handleToolModeChange = useCallback(
    (mode: EditorToolMode) => {
      if (isTransformActive && mode !== "transform") {
        pendingToolModeRef.current = mode;
        setShowTransformDiscardConfirm(true);
        return;
      }

      if (mode === "transform" && toolMode !== "transform") {
        previousToolModeRef.current = toolMode;
      }
      setToolMode(mode);
    },
    [isTransformActive, toolMode, setToolMode]
  );

  const handleTransformDiscardConfirm = useCallback(() => {
    cancelTransform();
    if (pendingToolModeRef.current) {
      setToolMode(pendingToolModeRef.current);
      pendingToolModeRef.current = null;
    }
    previousToolModeRef.current = null;
    setShowTransformDiscardConfirm(false);
  }, [cancelTransform, setToolMode]);

  const handleTransformApplyAndSwitch = useCallback(() => {
    applyTransform();
    if (pendingToolModeRef.current) {
      setToolMode(pendingToolModeRef.current);
      pendingToolModeRef.current = null;
    }
    previousToolModeRef.current = null;
    setShowTransformDiscardConfirm(false);
  }, [applyTransform, setToolMode]);

  const handleTransformDiscardCancel = useCallback(() => {
    pendingToolModeRef.current = null;
    setShowTransformDiscardConfirm(false);
  }, []);

  return {
    showTransformDiscardConfirm,
    handleToolModeChange,
    handleTransformDiscardConfirm,
    handleTransformApplyAndSwitch,
    handleTransformDiscardCancel,
    previousToolModeRef,
  };
}
