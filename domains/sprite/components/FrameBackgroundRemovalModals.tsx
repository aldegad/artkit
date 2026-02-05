"use client";

import { BackgroundRemovalModals as SharedBackgroundRemovalModals } from "../../../shared/components";

// ============================================
// Types
// ============================================

interface FrameBackgroundRemovalModalsProps {
  // Confirmation modal props
  showConfirm: boolean;
  onCloseConfirm: () => void;
  onConfirm: () => void;

  // Loading modal props
  isRemoving: boolean;
  progress: number;
  status: string;

  // Translations
  translations: {
    removeBackground: string;
    cancel: string;
    confirm: string;
    removingBackgroundDesc: string;
    frameBackgroundRemoval: string;
    firstRunDownload: string;
  };
}

// ============================================
// Component
// ============================================

export function FrameBackgroundRemovalModals({
  showConfirm,
  onCloseConfirm,
  onConfirm,
  isRemoving,
  progress,
  status,
  translations: t,
}: FrameBackgroundRemovalModalsProps) {
  return (
    <SharedBackgroundRemovalModals
      showConfirm={showConfirm}
      onCloseConfirm={onCloseConfirm}
      onConfirm={onConfirm}
      isRemoving={isRemoving}
      progress={progress}
      status={status}
      translations={{
        title: t.removeBackground,
        description: t.removingBackgroundDesc,
        selectionNote: t.frameBackgroundRemoval,
        downloadNote: t.firstRunDownload,
        cancel: t.cancel,
        confirm: t.confirm,
      }}
    />
  );
}
