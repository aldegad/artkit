"use client";

import { Modal } from "@/shared/components";
import { SpinnerIcon } from "@/shared/components/icons";
import type { RifeInterpolationQuality } from "@/shared/ai/frameInterpolation";

interface FrameInterpolationModalsProps {
  showConfirm: boolean;
  onCloseConfirm: () => void;
  onConfirm: () => void;
  isInterpolating: boolean;
  progress: number;
  status: string;
  selectedFrameCount: number;
  interpolationPairCount: number;
  steps: number;
  quality: RifeInterpolationQuality;
  onStepsChange: (steps: number) => void;
  onQualityChange: (quality: RifeInterpolationQuality) => void;
  translations: {
    frameInterpolation: string;
    interpolationDescription: string;
    interpolationSteps: string;
    interpolationQuality: string;
    qualityFast: string;
    qualityHigh: string;
    qualityFastHint: string;
    qualityHighHint: string;
    estimatedFrames: string;
    firstRunDownload: string;
    cancel: string;
    generate: string;
  };
}

export function FrameInterpolationModals({
  showConfirm,
  onCloseConfirm,
  onConfirm,
  isInterpolating,
  progress,
  status,
  selectedFrameCount,
  interpolationPairCount,
  steps,
  quality,
  onStepsChange,
  onQualityChange,
  translations: t,
}: FrameInterpolationModalsProps) {
  const estimatedFrames = interpolationPairCount * steps;
  const canGenerate = interpolationPairCount > 0;
  const confirmFooter = (
    <div className="flex justify-end gap-2">
      <button
        onClick={onCloseConfirm}
        className="px-4 py-2 text-sm rounded-lg bg-surface-secondary hover:bg-surface-tertiary transition-colors"
      >
        {t.cancel}
      </button>
      <button
        onClick={onConfirm}
        disabled={!canGenerate}
        className="px-4 py-2 text-sm rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {t.generate}
      </button>
    </div>
  );

  return (
    <>
      {showConfirm && (
        <Modal
          isOpen={showConfirm}
          onClose={onCloseConfirm}
          title={t.frameInterpolation}
          width="520px"
          contentClassName="px-6 py-4 space-y-3"
          footer={confirmFooter}
        >
          <p className="text-text-secondary text-sm">{t.interpolationDescription}</p>
          <p className="text-text-tertiary text-xs">
            Selected: {selectedFrameCount} / Pairs: {interpolationPairCount}
          </p>
          <p className="text-text-tertiary text-xs">{t.firstRunDownload}</p>

          <div className="flex items-center gap-3">
            <label className="text-sm text-text-secondary min-w-28">{t.interpolationSteps}</label>
            <input
              type="number"
              min={1}
              max={8}
              value={steps}
              onChange={(event) => {
                const next = Number(event.target.value);
                onStepsChange(Number.isFinite(next) ? Math.max(1, Math.min(8, Math.floor(next))) : 1);
              }}
              className="w-20 px-2 py-1 text-sm rounded bg-surface-secondary border border-border-default"
            />
          </div>

          <div>
            <label className="text-sm text-text-secondary block mb-1.5">{t.interpolationQuality}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onQualityChange("fast")}
                className={`text-left px-3 py-2 rounded border transition-colors ${
                  quality === "fast"
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-border-default bg-surface-secondary hover:bg-surface-tertiary"
                }`}
              >
                <div className="text-sm text-text-primary font-medium">{t.qualityFast}</div>
                <div className="text-[11px] text-text-tertiary">{t.qualityFastHint}</div>
              </button>
              <button
                onClick={() => onQualityChange("high")}
                className={`text-left px-3 py-2 rounded border transition-colors ${
                  quality === "high"
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-border-default bg-surface-secondary hover:bg-surface-tertiary"
                }`}
              >
                <div className="text-sm text-text-primary font-medium">{t.qualityHigh}</div>
                <div className="text-[11px] text-text-tertiary">{t.qualityHighHint}</div>
              </button>
            </div>
          </div>

          <p className="text-xs text-text-tertiary">{t.estimatedFrames}: {estimatedFrames}</p>
        </Modal>
      )}

      {isInterpolating && (
        <Modal
          isOpen={isInterpolating}
          onClose={() => {}}
          title={t.frameInterpolation}
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
