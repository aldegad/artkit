"use client";

import { Modal } from "../../../shared/components";
import { ImageIcon } from "@/shared/components/icons";

interface NewCanvasChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportImage: () => void;
  onBlankCanvas: () => void;
  translations: {
    title: string;
    importImage: string;
    blankCanvas: string;
    cancel: string;
  };
}

export default function NewCanvasChoiceModal({
  isOpen,
  onClose,
  onImportImage,
  onBlankCanvas,
  translations: t,
}: NewCanvasChoiceModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.title}
      width="400px"
    >
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            onClose();
            onImportImage();
          }}
          className="flex items-center gap-3 p-4 rounded-lg border border-border-default hover:bg-interactive-hover transition-colors text-left"
        >
          <div className="w-12 h-12 rounded-lg bg-surface-tertiary flex items-center justify-center shrink-0">
            <ImageIcon className="w-6 h-6 text-text-secondary" />
          </div>
          <div>
            <div className="font-medium text-sm">{t.importImage}</div>
            <div className="text-xs text-text-tertiary">이미지 파일을 불러와 편집합니다</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onBlankCanvas();
          }}
          className="flex items-center gap-3 p-4 rounded-lg border border-border-default hover:bg-interactive-hover transition-colors text-left"
        >
          <div className="w-12 h-12 rounded-lg bg-surface-tertiary flex items-center justify-center shrink-0 text-text-secondary text-xl font-light">
            ∅
          </div>
          <div>
            <div className="font-medium text-sm">{t.blankCanvas}</div>
            <div className="text-xs text-text-tertiary">크기를 지정한 빈 캔버스로 시작합니다</div>
          </div>
        </button>
      </div>
    </Modal>
  );
}
