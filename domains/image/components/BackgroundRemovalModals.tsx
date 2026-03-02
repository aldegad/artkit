"use client";

import { BackgroundRemovalModals as SharedBackgroundRemovalModals } from "../../../shared/components";
import {
  BACKGROUND_REMOVAL_MODELS,
  DEFAULT_BACKGROUND_REMOVAL_MODEL,
  type BackgroundRemovalQuality,
} from "@/shared/ai/backgroundRemoval";

// ============================================
// Types
// ============================================

interface BackgroundRemovalModalsProps {
  // Confirmation modal props
  showConfirm: boolean;
  onCloseConfirm: () => void;
  onConfirm: () => void;
  hasSelection: boolean;
  quality: BackgroundRemovalQuality;
  onQualityChange: (quality: BackgroundRemovalQuality) => void;

  // Loading modal props
  isRemoving: boolean;
  progress: number;
  status: string;

  // Translations
  translations: {
    removeBackground: string;
    cancel: string;
    confirm: string;
  };
}

// ============================================
// Component
// ============================================

export function BackgroundRemovalModals({
  showConfirm,
  onCloseConfirm,
  onConfirm,
  hasSelection,
  quality,
  onQualityChange,
  isRemoving,
  progress,
  status,
  translations: t,
}: BackgroundRemovalModalsProps) {
  const selectedModel = BACKGROUND_REMOVAL_MODELS[DEFAULT_BACKGROUND_REMOVAL_MODEL];

  return (
    <SharedBackgroundRemovalModals
      showConfirm={showConfirm}
      onCloseConfirm={onCloseConfirm}
      onConfirm={onConfirm}
      isRemoving={isRemoving}
      progress={progress}
      status={status}
      hasSelection={hasSelection}
      translations={{
        title: t.removeBackground,
        description: "AI 모델을 사용해 선택된 레이어의 배경을 자동으로 제거합니다.",
        selectionNote: hasSelection
          ? "선택 영역의 배경만 제거됩니다."
          : "전체 레이어의 배경이 제거됩니다.",
        downloadNote: "첫 실행 시 배경 제거 모델 파일을 다운로드합니다.",
        cancel: t.cancel,
        confirm: t.confirm,
      }}
      confirmExtras={(
        <div className="space-y-3 pt-1">
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

          <div>
            <div className="text-xs text-text-tertiary mb-1.5">Model</div>
            <div className="px-3 py-2 rounded border border-border-default bg-surface-secondary">
              <div className="text-sm text-text-primary font-medium">{selectedModel.label}</div>
              <div className="text-[11px] text-text-tertiary">{selectedModel.downloadHint}</div>
              <div className="text-[11px] text-text-tertiary">{selectedModel.description}</div>
            </div>
          </div>
        </div>
      )}
    />
  );
}
