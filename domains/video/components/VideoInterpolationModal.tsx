"use client";

import { SpinnerIcon } from "@/shared/components/icons";
import type { RifeInterpolationQuality } from "@/shared/ai/frameInterpolation";

interface VideoInterpolationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  gapDuration: number;
  suggestedSteps: number;
  steps: number;
  quality: RifeInterpolationQuality;
  onStepsChange: (steps: number) => void;
  onQualityChange: (quality: RifeInterpolationQuality) => void;
  isInterpolating: boolean;
  progress: number;
  status: string;
  translations: {
    frameInterpolation: string;
    frameInterpolationDescription: string;
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

export function VideoInterpolationModal({
  open,
  onClose,
  onConfirm,
  gapDuration,
  steps,
  quality,
  onStepsChange,
  onQualityChange,
  isInterpolating,
  progress,
  status,
  translations: t,
}: VideoInterpolationModalProps) {
  if (!open && !isInterpolating) return null;

  return (
    <>
      {/* Confirm modal */}
      {open && !isInterpolating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-primary rounded-lg p-6 shadow-xl max-w-md w-[92vw]">
            <h3 className="text-lg font-semibold text-text-primary mb-2">{t.frameInterpolation}</h3>
            <p className="text-text-secondary text-sm mb-2">{t.frameInterpolationDescription}</p>
            <p className="text-text-tertiary text-xs mb-1">
              Gap: {gapDuration.toFixed(2)}s
            </p>
            <p className="text-text-tertiary text-xs mb-4">{t.firstRunDownload}</p>

            <div className="flex items-center gap-3 mb-3">
              <label className="text-sm text-text-secondary min-w-28">{t.interpolationSteps}</label>
              <input
                type="number"
                min={1}
                max={60}
                value={steps}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  onStepsChange(Number.isFinite(next) ? Math.max(1, Math.min(60, Math.floor(next))) : 1);
                }}
                className="w-20 px-2 py-1 text-sm rounded bg-surface-secondary border border-border-default"
              />
            </div>

            <div className="mb-3">
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

            <p className="text-xs text-text-tertiary mb-4">
              {t.estimatedFrames}: {steps}
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg bg-surface-secondary hover:bg-surface-tertiary transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white transition-colors"
              >
                {t.generate}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress overlay */}
      {isInterpolating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-primary rounded-lg p-6 shadow-xl flex flex-col items-center gap-4 min-w-[280px]">
            <SpinnerIcon className="w-12 h-12 text-accent-primary" />
            <div className="text-center">
              <p className="text-text-primary font-medium">{t.frameInterpolation}</p>
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
        </div>
      )}
    </>
  );
}
