"use client";

import { BackgroundRemovalModals } from "@/shared/components";
import {
  UPSCALE_MODEL_INFO,
  type UpscaleScale,
} from "@/shared/ai/upscale";

interface UpscaleModalProps {
  showConfirm: boolean;
  onCloseConfirm: () => void;
  onConfirm: () => void;
  scale: UpscaleScale;
  onScaleChange: (scale: UpscaleScale) => void;
  isUpscaling: boolean;
  progress: number;
  status: string;
  currentSize: { width: number; height: number };
  translations: {
    title: string;
    cancel: string;
    confirm: string;
  };
}

export function UpscaleModal({
  showConfirm,
  onCloseConfirm,
  onConfirm,
  scale,
  onScaleChange,
  isUpscaling,
  progress,
  status,
  currentSize,
  translations: t,
}: UpscaleModalProps) {
  const scaleOptions: UpscaleScale[] = [2, 4];

  return (
    <BackgroundRemovalModals
      showConfirm={showConfirm}
      onCloseConfirm={onCloseConfirm}
      onConfirm={onConfirm}
      isRemoving={isUpscaling}
      progress={progress}
      status={status}
      translations={{
        title: t.title,
        description:
          "AI 모델을 사용해 선택된 레이어를 고해상도로 업스케일합니다.",
        downloadNote:
          "첫 실행 시 업스케일 모델 파일을 다운로드합니다.",
        cancel: t.cancel,
        confirm: t.confirm,
      }}
      confirmExtras={
        <div className="space-y-3 pt-1">
          <div>
            <div className="text-xs text-text-tertiary mb-1.5">Scale</div>
            <div className="grid grid-cols-2 gap-2">
              {scaleOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onScaleChange(s)}
                  className={`text-left px-3 py-2 rounded border transition-colors ${
                    scale === s
                      ? "border-accent-primary bg-accent-primary/10"
                      : "border-border-default bg-surface-secondary hover:bg-surface-tertiary"
                  }`}
                >
                  <div className="text-sm text-text-primary font-medium">
                    x{s}
                  </div>
                  <div className="text-[11px] text-text-tertiary">
                    {currentSize.width * s} × {currentSize.height * s}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-text-tertiary mb-1.5">Model</div>
            <div className="px-3 py-2 rounded border border-border-default bg-surface-secondary">
              <div className="text-sm text-text-primary font-medium">
                {UPSCALE_MODEL_INFO.label}
              </div>
              <div className="text-[11px] text-text-tertiary">
                {UPSCALE_MODEL_INFO.downloadHint} · {UPSCALE_MODEL_INFO.description}
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
}
