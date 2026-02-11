"use client";

import { BackgroundRemovalModals as SharedBackgroundRemovalModals } from "../../../shared/components";
import { Modal } from "@/shared/components";
import { PersonIcon } from "../../../shared/components/icons";
import type { BackgroundRemovalQuality } from "@/shared/ai/backgroundRemoval";

// ============================================
// Types
// ============================================

interface FrameBackgroundRemovalModalsProps {
  showConfirm: boolean;
  onCloseConfirm: () => void;
  onConfirmCurrentFrame: () => void;
  onConfirmSelectedFrames: () => void;
  onConfirmAllFrames: () => void;
  quality: BackgroundRemovalQuality;
  onQualityChange: (quality: BackgroundRemovalQuality) => void;
  isRemoving: boolean;
  progress: number;
  status: string;
  hasFrames: boolean;
  selectedFrameCount: number;
  translations: {
    removeBackground: string;
    cancel: string;
    removingBackgroundDesc: string;
    frameBackgroundRemoval: string;
    firstRunDownload: string;
    currentFrame: string;
    selectedFrames: string;
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
  onConfirmSelectedFrames,
  onConfirmAllFrames,
  quality,
  onQualityChange,
  isRemoving,
  progress,
  status,
  hasFrames,
  selectedFrameCount,
  translations: t,
}: FrameBackgroundRemovalModalsProps) {
  return (
    <>
      {showConfirm && (
        <Modal
          isOpen={showConfirm}
          onClose={onCloseConfirm}
          title={(
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center">
                <PersonIcon className="w-5 h-5 text-accent-primary" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">{t.removeBackground}</h3>
            </div>
          )}
          width="760px"
          maxHeight="85vh"
          contentClassName="px-6 py-4 space-y-4"
        >
          <p className="text-text-secondary text-sm">{t.removingBackgroundDesc}</p>
          <p className="text-text-tertiary text-xs">{t.frameBackgroundRemoval}</p>
          <p className="text-text-tertiary text-xs">{t.firstRunDownload}</p>

          <div>
            <div className="text-xs text-text-tertiary mb-1.5">Quality</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onQualityChange("fast")}
                className={`text-left px-3 py-2 rounded border transition-colors ${
                  quality === "fast"
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-border-default bg-surface-secondary hover:bg-surface-tertiary"
                }`}
              >
                <div className="text-sm text-text-primary font-medium">Fast</div>
                <div className="text-[11px] text-text-tertiary">Speed first</div>
              </button>
              <button
                onClick={() => onQualityChange("balanced")}
                className={`text-left px-3 py-2 rounded border transition-colors ${
                  quality === "balanced"
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-border-default bg-surface-secondary hover:bg-surface-tertiary"
                }`}
              >
                <div className="text-sm text-text-primary font-medium">Balanced</div>
                <div className="text-[11px] text-text-tertiary">Recommended</div>
              </button>
              <button
                onClick={() => onQualityChange("high")}
                className={`text-left px-3 py-2 rounded border transition-colors ${
                  quality === "high"
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-border-default bg-surface-secondary hover:bg-surface-tertiary"
                }`}
              >
                <div className="text-sm text-text-primary font-medium">High</div>
                <div className="text-[11px] text-text-tertiary">Cleaner edges</div>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
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
              onClick={onConfirmSelectedFrames}
              disabled={selectedFrameCount < 2}
              className="px-4 py-2 text-sm rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.selectedFrames} ({selectedFrameCount})
            </button>
            <button
              onClick={onConfirmAllFrames}
              disabled={!hasFrames}
              className="px-4 py-2 text-sm rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.allFrames}
            </button>
          </div>
        </Modal>
      )}

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
