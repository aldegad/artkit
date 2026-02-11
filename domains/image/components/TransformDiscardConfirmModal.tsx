"use client";

import { Modal } from "@/shared/components";
import { WarningIcon } from "@/shared/components/icons";

// ============================================
// Types
// ============================================

interface TransformDiscardConfirmModalProps {
  show: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onApply: () => void;
  translations: {
    title: string;
    message: string;
    discard: string;
    apply: string;
    cancel: string;
  };
}

// ============================================
// Component
// ============================================

export function TransformDiscardConfirmModal({
  show,
  onClose,
  onDiscard,
  onApply,
  translations: t,
}: TransformDiscardConfirmModalProps) {
  if (!show) return null;

  const titleContent = (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
        <WarningIcon className="w-5 h-5 text-warning" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary">{t.title}</h3>
    </div>
  );

  const footerContent = (
    <div className="flex gap-2 justify-end">
      <button
        onClick={onClose}
        className="px-4 py-2 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors"
      >
        {t.cancel}
      </button>
      <button
        onClick={onDiscard}
        className="px-4 py-2 text-sm rounded bg-surface-tertiary hover:bg-surface-tertiary/80 text-text-primary transition-colors"
      >
        {t.discard}
      </button>
      <button
        onClick={onApply}
        className="px-4 py-2 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors"
      >
        {t.apply}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={show}
      onClose={onClose}
      title={titleContent}
      width="420px"
      contentClassName="px-6 py-4"
      footer={footerContent}
    >
      <p className="text-text-secondary text-sm">{t.message}</p>
    </Modal>
  );
}
