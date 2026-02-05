"use client";

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
}

// ============================================
// Icons (inline SVGs to avoid dependencies)
// ============================================

function PersonIcon() {
  return (
    <svg
      className="w-5 h-5 text-accent-primary"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="7" r="3" strokeWidth={2} />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 10c-4 0-6 2.5-6 5v2h12v-2c0-2.5-2-5-6-5z"
      />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="w-12 h-12 animate-spin text-accent-primary"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
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
}: BackgroundRemovalModalsProps) {
  return (
    <>
      {/* Background Removal Confirmation Popup */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-primary rounded-lg p-6 shadow-xl max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center">
                <PersonIcon />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">
                {t.title}
              </h3>
            </div>
            <p className="text-text-secondary text-sm mb-2">{t.description}</p>
            {t.selectionNote && hasSelection !== undefined && (
              <p className="text-text-tertiary text-xs mb-4">
                {t.selectionNote}
              </p>
            )}
            <p className="text-text-tertiary text-xs mb-4">{t.downloadNote}</p>
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
          </div>
        </div>
      )}

      {/* Background Removal Loading Overlay */}
      {isRemoving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-primary rounded-lg p-6 shadow-xl flex flex-col items-center gap-4 min-w-[280px]">
            <div className="relative">
              <LoadingSpinner />
            </div>
            <div className="text-center">
              <p className="text-text-primary font-medium">{t.title}</p>
              <p className="text-text-secondary text-sm mt-1">{status}</p>
              <div className="mt-3 w-full bg-surface-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent-primary h-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-text-tertiary text-xs mt-2">
                {Math.round(progress)}%
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
