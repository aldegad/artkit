"use client";

import { BackgroundRemovalModals as SharedBackgroundRemovalModals } from "../../../shared/components";
import { PersonIcon } from "../../../shared/components/icons";

// ============================================
// Types
// ============================================

interface FrameBackgroundRemovalModalsProps {
  showConfirm: boolean;
  onCloseConfirm: () => void;
  onConfirmCurrentFrame: () => void;
  onConfirmAllFrames: () => void;
  isRemoving: boolean;
  progress: number;
  status: string;
  hasFrames: boolean;
  translations: {
    removeBackground: string;
    cancel: string;
    removingBackgroundDesc: string;
    frameBackgroundRemoval: string;
    firstRunDownload: string;
    currentFrame: string;
    allFrames: string;
  };
}

// ============================================
// Component
// ============================================

export function FrameBackgroundRemovalModals({
  showConfirm,
  onCloseConfirm,
  onConfirmCurrentFrame,
  onConfirmAllFrames,
  isRemoving,
  progress,
  status,
  hasFrames,
  translations: t,
}: FrameBackgroundRemovalModalsProps) {
  return (
    <>
      {/* Custom confirmation modal with Current Frame / All Frames buttons */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-primary rounded-lg p-6 shadow-xl max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center">
                <PersonIcon className="w-5 h-5 text-accent-primary" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">
                {t.removeBackground}
              </h3>
            </div>
            <p className="text-text-secondary text-sm mb-2">{t.removingBackgroundDesc}</p>
            <p className="text-text-tertiary text-xs mb-2">{t.frameBackgroundRemoval}</p>
            <p className="text-text-tertiary text-xs mb-4">{t.firstRunDownload}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onCloseConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-surface-secondary hover:bg-surface-tertiary transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={onConfirmCurrentFrame}
                className="px-4 py-2 text-sm rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white transition-colors"
              >
                {t.currentFrame}
              </button>
              <button
                onClick={onConfirmAllFrames}
                disabled={!hasFrames}
                className="px-4 py-2 text-sm rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.allFrames}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay - reuse shared component */}
      <SharedBackgroundRemovalModals
        showConfirm={false}
        onCloseConfirm={() => {}}
        onConfirm={() => {}}
        isRemoving={isRemoving}
        progress={progress}
        status={status}
        translations={{
          title: t.removeBackground,
          description: "",
          downloadNote: "",
          cancel: "",
          confirm: "",
        }}
      />
    </>
  );
}
