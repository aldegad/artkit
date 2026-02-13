"use client";

import { Modal } from "@/shared/components";
import { LockAspectIcon, UnlockAspectIcon } from "@/shared/components/icons";

interface ImageResampleModalProps {
  isOpen: boolean;
  isResampling: boolean;
  width: number;
  height: number;
  keepAspect: boolean;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onToggleKeepAspect: () => void;
  onClose: () => void;
  onApply: () => void;
  translations: {
    title: string;
    width: string;
    height: string;
    keepAspect: string;
    cancel: string;
    apply: string;
    applying: string;
  };
}

export function ImageResampleModal({
  isOpen,
  isResampling,
  width,
  height,
  keepAspect,
  onWidthChange,
  onHeightChange,
  onToggleKeepAspect,
  onClose,
  onApply,
  translations: t,
}: ImageResampleModalProps) {
  const canApply = width > 0 && height > 0 && !isResampling;

  const footer = (
    <div className="flex justify-end gap-2">
      <button
        onClick={onClose}
        disabled={isResampling}
        className="px-3 py-1.5 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-50"
      >
        {t.cancel}
      </button>
      <button
        onClick={onApply}
        disabled={!canApply}
        className="px-3 py-1.5 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
      >
        {isResampling ? t.applying : t.apply}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.title}
      width="380px"
      contentClassName="px-4 py-3"
      footer={footer}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="min-w-0 flex items-center gap-1">
            <span className="text-xs text-text-secondary w-5">W</span>
            <input
              type="number"
              min={1}
              value={Math.round(width)}
              onChange={(e) => onWidthChange(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
              disabled={isResampling}
              className="w-full min-w-0 px-2 py-1.5 bg-surface-secondary border border-border-default rounded text-sm focus:outline-none focus:border-accent-primary disabled:opacity-50"
              aria-label={t.width}
            />
          </div>
          <span className="text-xs text-text-tertiary">×</span>
          <div className="min-w-0 flex items-center gap-1">
            <span className="text-xs text-text-secondary w-5">H</span>
            <input
              type="number"
              min={1}
              value={Math.round(height)}
              onChange={(e) => onHeightChange(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
              disabled={isResampling}
              className="w-full min-w-0 px-2 py-1.5 bg-surface-secondary border border-border-default rounded text-sm focus:outline-none focus:border-accent-primary disabled:opacity-50"
              aria-label={t.height}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">{t.keepAspect}</span>
          <button
            onClick={onToggleKeepAspect}
            disabled={isResampling}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              keepAspect
                ? "bg-accent-primary text-white"
                : "hover:bg-interactive-hover text-text-secondary"
            }`}
            title={t.keepAspect}
          >
            {keepAspect ? <LockAspectIcon /> : <UnlockAspectIcon />}
          </button>
        </div>
      </div>
    </Modal>
  );
}
