"use client";

import { BackgroundRemovalModals as SharedBackgroundRemovalModals } from "../../../shared/components";
import {
  BACKGROUND_REMOVAL_MODELS,
  type BackgroundRemovalModel,
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
  model: BackgroundRemovalModel;
  onModelChange: (model: BackgroundRemovalModel) => void;

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
  model,
  onModelChange,
  isRemoving,
  progress,
  status,
  translations: t,
}: BackgroundRemovalModalsProps) {
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
        downloadNote: "선택한 모델에 따라 첫 실행 다운로드 용량이 달라집니다.",
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {(Object.keys(BACKGROUND_REMOVAL_MODELS) as BackgroundRemovalModel[]).map((modelKey) => {
                const modelConfig = BACKGROUND_REMOVAL_MODELS[modelKey];
                const isSelected = model === modelKey;
                return (
                  <button
                    key={modelKey}
                    onClick={() => onModelChange(modelKey)}
                    className={`text-left px-3 py-2 rounded border transition-colors ${
                      isSelected
                        ? "border-accent-primary bg-accent-primary/10"
                        : "border-border-default bg-surface-secondary hover:bg-surface-tertiary"
                    }`}
                  >
                    <div className="text-sm text-text-primary font-medium">{modelConfig.label}</div>
                    <div className="text-[11px] text-text-tertiary">{modelConfig.downloadHint}</div>
                    <div className="text-[11px] text-text-tertiary">{modelConfig.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    />
  );
}
