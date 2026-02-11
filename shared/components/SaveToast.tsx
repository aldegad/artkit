"use client";

import { useEffect, useRef } from "react";
import {
  dismissToast,
  showProgressToast,
  showSuccessToast,
  updateToast,
} from "./ToastProvider";

// ============================================
// Types
// ============================================

interface SaveToastProps {
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Triggers toast display on each completed save (increment to re-trigger) */
  saveCount: number;
  /** Label shown while saving */
  savingLabel?: string;
  /** Label shown on save success */
  savedLabel?: string;
  /** Optional progress information for save operation */
  progress?: {
    current: number;
    total: number;
    detail?: string;
  } | null;
}

// ============================================
// Component
// ============================================

export function SaveToast({
  isSaving,
  saveCount,
  savingLabel = "Saving…",
  savedLabel = "Saved",
  progress = null,
}: SaveToastProps) {
  const savingToastIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const lastSaveCountRef = useRef(saveCount);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSaveCountRef.current = saveCount;
      return;
    }

    if (saveCount > lastSaveCountRef.current) {
      if (savingToastIdRef.current) {
        dismissToast(savingToastIdRef.current);
        savingToastIdRef.current = null;
      }
      showSuccessToast({
        title: savedLabel,
        duration: 1500,
      });
    }
    lastSaveCountRef.current = saveCount;
  }, [saveCount, savedLabel]);

  useEffect(() => {
    if (!isSaving) {
      if (savingToastIdRef.current) {
        dismissToast(savingToastIdRef.current);
        savingToastIdRef.current = null;
      }
      return;
    }

    const nextProgress = progress && progress.total > 0
      ? Math.max(0, Math.min(100, (progress.current / progress.total) * 100))
      : undefined;

    if (!savingToastIdRef.current) {
      savingToastIdRef.current = showProgressToast({
        title: savingLabel,
        description: progress?.detail,
        progress: nextProgress,
      });
      return;
    }

    updateToast(savingToastIdRef.current, {
      title: savingLabel,
      description: progress?.detail,
      progress: nextProgress,
      duration: null,
    });
  }, [isSaving, progress, savingLabel]);

  useEffect(() => {
    return () => {
      if (savingToastIdRef.current) {
        dismissToast(savingToastIdRef.current);
      }
    };
  }, []);

  return null;
}
