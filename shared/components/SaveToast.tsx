"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "./icons";

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
}

// ============================================
// Component
// ============================================

export function SaveToast({
  isSaving,
  saveCount,
  savingLabel = "Saving…",
  savedLabel = "Saved",
}: SaveToastProps) {
  const [visible, setVisible] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Show spinner while saving
  useEffect(() => {
    if (isSaving) {
      setVisible(true);
      setShowSuccess(false);
    }
  }, [isSaving]);

  // Show success briefly when save completes
  useEffect(() => {
    if (saveCount === 0) return;
    setShowSuccess(true);
    setVisible(true);

    const timer = setTimeout(() => {
      setVisible(false);
      setShowSuccess(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [saveCount]);

  if (!visible) return null;

  return (
    <div
      style={{ animation: "saveToastIn 200ms ease-out" }}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border border-border-default bg-surface-primary text-sm text-text-secondary"
    >
      {showSuccess ? (
        <>
          <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckIcon className="w-3 h-3 text-green-500" />
          </div>
          <span>{savedLabel}</span>
        </>
      ) : (
        <>
          <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          <span>{savingLabel}</span>
        </>
      )}
    </div>
  );
}
