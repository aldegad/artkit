"use client";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-primary rounded-lg p-6 shadow-xl max-w-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-warning"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text-primary">{t.title}</h3>
        </div>
        <p className="text-text-secondary text-sm mb-4">
          {t.message}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={onDiscard}
            className="px-4 py-2 text-sm rounded bg-red-500 hover:bg-red-600 text-white transition-colors"
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
      </div>
    </div>
  );
}
