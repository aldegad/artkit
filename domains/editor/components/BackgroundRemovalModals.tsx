"use client";

import { BackgroundRemovalModals as SharedBackgroundRemovalModals } from "../../../shared/components";

// ============================================
// Types
// ============================================

interface BackgroundRemovalModalsProps {
  // Confirmation modal props
  showConfirm: boolean;
  onCloseConfirm: () => void;
  onConfirm: () => void;
  hasSelection: boolean;

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
        downloadNote: "첫 실행 시 AI 모델을 다운로드합니다 (~30MB)",
        cancel: t.cancel,
        confirm: t.confirm,
      }}
    />
  );
}
