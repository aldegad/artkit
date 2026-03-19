"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/shared/components";
import {
  getBlankCanvasSizeHistory,
  type CanvasSizeEntry,
} from "../utils/blankCanvasHistory";

const RECOMMENDED_SIZES: CanvasSizeEntry[] = [
  { width: 1920, height: 1080 },   // Full HD
  { width: 1080, height: 1080 },   // 정사각형 SNS
  { width: 1200, height: 630 },   // 오픈그래프
  { width: 800, height: 600 },     // 일반
  { width: 512, height: 512 },     // 아이콘/작은 정사각형
  { width: 3840, height: 2160 },   // 4K
];

const MIN_SIZE = 1;
const MAX_SIZE = 8192;

interface BlankCanvasSizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (width: number, height: number) => void;
  translations: {
    title: string;
    recommended: string;
    custom: string;
    width: string;
    height: string;
    history: string;
    cancel: string;
    create: string;
  };
}

export default function BlankCanvasSizeModal({
  isOpen,
  onClose,
  onConfirm,
  translations: t,
}: BlankCanvasSizeModalProps) {
  const [customWidth, setCustomWidth] = useState(800);
  const [customHeight, setCustomHeight] = useState(600);
  const [history, setHistory] = useState<CanvasSizeEntry[]>([]);

  useEffect(() => {
    if (isOpen) setHistory(getBlankCanvasSizeHistory());
  }, [isOpen]);

  const clamp = (v: number) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, v));

  const handleConfirm = (width: number, height: number) => {
    const w = clamp(width);
    const h = clamp(height);
    if (w < MIN_SIZE || h < MIN_SIZE) return;
    onClose();
    onConfirm(w, h);
  };

  const canCreateCustom =
    customWidth >= MIN_SIZE &&
    customWidth <= MAX_SIZE &&
    customHeight >= MIN_SIZE &&
    customHeight <= MAX_SIZE;

  const footer = (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="px-3 py-1.5 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors"
      >
        {t.cancel}
      </button>
      <button
        type="button"
        onClick={() => handleConfirm(customWidth, customHeight)}
        disabled={!canCreateCustom}
        className="px-3 py-1.5 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
      >
        {t.create}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.title}
      width="420px"
      contentClassName="px-4 py-3 flex flex-col gap-4 min-h-0"
      footer={footer}
    >
      {/* 추천 크기 */}
      <div>
        <div className="text-xs font-medium text-text-secondary mb-2">{t.recommended}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {RECOMMENDED_SIZES.map(({ width, height }) => (
            <button
              key={`${width}x${height}`}
              type="button"
              onClick={() => handleConfirm(width, height)}
              className="px-3 py-2 rounded-lg border border-border-default hover:bg-interactive-hover text-left text-sm"
            >
              {width} × {height}
            </button>
          ))}
        </div>
      </div>

      {/* 직접 입력 */}
      <div>
        <div className="text-xs font-medium text-text-secondary mb-2">{t.custom}</div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs text-text-tertiary shrink-0">{t.width}</span>
            <input
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={customWidth}
              onChange={(e) => setCustomWidth(clamp(Number.parseInt(e.target.value, 10) || MIN_SIZE))}
              className="w-20 px-2 py-1.5 text-sm rounded border border-border-default bg-surface-primary"
            />
          </label>
          <span className="text-text-tertiary">×</span>
          <label className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs text-text-tertiary shrink-0">{t.height}</span>
            <input
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={customHeight}
              onChange={(e) => setCustomHeight(clamp(Number.parseInt(e.target.value, 10) || MIN_SIZE))}
              className="w-20 px-2 py-1.5 text-sm rounded border border-border-default bg-surface-primary"
            />
          </label>
        </div>
      </div>

      {/* 히스토리 (있을 때만) */}
      {history.length > 0 && (
        <div>
          <div className="text-xs font-medium text-text-secondary mb-2">{t.history}</div>
          <div className="flex flex-wrap gap-2">
            {history.map(({ width, height }) => (
              <button
                key={`h-${width}x${height}`}
                type="button"
                onClick={() => handleConfirm(width, height)}
                className="px-3 py-1.5 rounded-lg border border-border-default hover:bg-interactive-hover text-sm"
              >
                {width} × {height}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
