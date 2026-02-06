"use client";

import { SpinnerIcon } from "./icons";

// ============================================
// Types
// ============================================

interface LoadingOverlayProps {
  /** Whether to show the overlay */
  isLoading: boolean;
  /** Loading message */
  message?: string;
}

// ============================================
// Component
// ============================================

export function LoadingOverlay({
  isLoading,
  message,
}: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-primary border border-border-default shadow-lg">
        <SpinnerIcon />
        {message && (
          <span className="text-sm text-text-secondary">{message}</span>
        )}
      </div>
    </div>
  );
}
