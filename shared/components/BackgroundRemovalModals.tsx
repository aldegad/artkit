"use client";

import type { ReactNode } from "react";
import { Modal } from "./Modal";
import { PersonIcon, SpinnerIcon } from "./icons";

// ============================================
// Types
// ============================================

interface BackgroundRemovalModalsProps {
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
    title: string;
    description: string;
    selectionNote?: string; // Optional: shown when hasSelection is defined
    downloadNote: string;
    cancel: string;
    confirm: string;
  };

  // Optional: for selection-aware descriptions
  hasSelection?: boolean;
  confirmExtras?: ReactNode;
}

// ============================================
// Component
// ============================================

export function BackgroundRemovalModals({
  showConfirm,
  onCloseConfirm,
  onConfirm,
  isRemoving,
  progress,
  status,
  translations: t,
  hasSelection,
  confirmExtras,
}: BackgroundRemovalModalsProps) {
  const confirmTitle = (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center">
        <PersonIcon className="w-5 h-5 text-accent-primary" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary">{t.title}</h3>
    </div>
  );

  const confirmFooter = (
    <div className="flex gap-2 justify-end">
      <button
        onClick={onCloseConfirm}
        className="px-4 py-2 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors"
      >
        {t.cancel}
      </button>
      <button
        onClick={onConfirm}
        className="px-4 py-2 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors"
      >
        {t.confirm}
      </button>
    </div>
  );

  return (
    <>
      {showConfirm && (
        <Modal
          isOpen={showConfirm}
          onClose={onCloseConfirm}
          title={confirmTitle}
          width="420px"
          maxHeight="85vh"
          contentClassName="px-6 py-4 space-y-2"
          footer={confirmFooter}
        >
          <p className="text-text-secondary text-sm">{t.description}</p>
          {t.selectionNote && hasSelection !== undefined && (
            <p className="text-text-tertiary text-xs">{t.selectionNote}</p>
          )}
          <p className="text-text-tertiary text-xs">{t.downloadNote}</p>
          {confirmExtras}
        </Modal>
      )}

      {isRemoving && (
        <Modal
          isOpen={isRemoving}
          onClose={() => {}}
          title={t.title}
          width="320px"
          closeOnBackdropClick={false}
          closeOnEscape={false}
          hideCloseButton
          contentClassName="px-6 py-5"
        >
          <div className="flex flex-col items-center gap-4">
            <SpinnerIcon className="w-12 h-12 text-accent-primary" />
            <div className="text-center w-full">
              <p className="text-text-secondary text-sm mt-1">{status}</p>
              <div className="mt-3 w-full bg-surface-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent-primary h-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
              </div>
              <p className="text-text-tertiary text-xs mt-2">{Math.round(progress)}%</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
