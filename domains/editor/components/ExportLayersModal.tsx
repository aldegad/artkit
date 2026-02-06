"use client";

import { useState } from "react";

// ============================================
// Types
// ============================================

interface ExportLayersModalProps {
  show: boolean;
  onClose: () => void;
  onExport: (backgroundColor: string | null) => void;
  layerCount: number;
  translations: {
    title: string;
    backgroundColor: string;
    transparent: string;
    export: string;
    cancel: string;
    layerCount: string;
  };
}

// ============================================
// Component
// ============================================

export function ExportLayersModal({
  show,
  onClose,
  onExport,
  layerCount,
  translations: t,
}: ExportLayersModalProps) {
  const [useBgColor, setUseBgColor] = useState(false);
  const [bgColor, setBgColor] = useState("#ffffff");

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-primary rounded-lg p-6 shadow-xl max-w-sm w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.title}</h3>

        <p className="text-text-secondary text-sm mb-4">
          {t.layerCount}: {layerCount}
        </p>

        {/* Background color option */}
        <div className="mb-4">
          <label className="text-sm text-text-secondary mb-2 block">{t.backgroundColor}</label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="bgMode"
                checked={!useBgColor}
                onChange={() => setUseBgColor(false)}
                className="accent-accent-primary"
              />
              <span className="text-sm text-text-primary">{t.transparent}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="bgMode"
                checked={useBgColor}
                onChange={() => setUseBgColor(true)}
                className="accent-accent-primary"
              />
              <input
                type="color"
                value={bgColor}
                onChange={(e) => {
                  setBgColor(e.target.value);
                  setUseBgColor(true);
                }}
                className="w-6 h-6 rounded border border-border-default cursor-pointer bg-transparent"
              />
              <span className="text-sm text-text-tertiary font-mono">{bgColor}</span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={() => onExport(useBgColor ? bgColor : null)}
            className="px-4 py-2 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors"
          >
            {t.export}
          </button>
        </div>
      </div>
    </div>
  );
}
