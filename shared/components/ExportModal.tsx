"use client";

import { useState, useEffect, useCallback } from "react";
import { Select } from "./Select";

// ============================================
// Types
// ============================================

type OutputFormat = "png" | "webp" | "jpeg";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (fileName: string, format: OutputFormat, quality: number) => void;
  defaultFileName: string;
  /** "single" for merged image, "layers" for per-layer ZIP */
  mode: "single" | "layers";
  translations: {
    export: string;
    cancel: string;
    fileName: string;
    format: string;
    quality: string;
  };
}

// ============================================
// Component
// ============================================

export function ExportModal({
  isOpen,
  onClose,
  onExport,
  defaultFileName,
  mode,
  translations: t,
}: ExportModalProps) {
  const [fileName, setFileName] = useState(defaultFileName);
  const [format, setFormat] = useState<OutputFormat>("png");
  const [quality, setQuality] = useState(0.9);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFileName(defaultFileName);
    }
  }, [isOpen, defaultFileName]);

  const handleExport = useCallback(() => {
    if (!fileName.trim()) return;
    onExport(fileName.trim(), format, quality);
    onClose();
  }, [fileName, format, quality, onExport, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleExport();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [handleExport, onClose],
  );

  if (!isOpen) return null;

  const ext = format === "jpeg" ? "jpg" : format;
  const fileSuffix = mode === "layers" ? ".zip" : `.${ext}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onKeyDown={handleKeyDown}>
      <div
        className="bg-surface-primary border border-border-default rounded-lg shadow-xl w-[360px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="text-sm font-semibold">{t.export}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-interactive-hover text-text-tertiary"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-3 flex flex-col gap-3">
          {/* File name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">{t.fileName}</label>
            <div className="flex items-center gap-0">
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                autoFocus
                className="flex-1 min-w-0 px-2 py-1.5 bg-surface-secondary border border-border-default rounded-l text-sm focus:outline-none focus:border-accent-primary"
              />
              <span className="px-2 py-1.5 bg-surface-tertiary border border-l-0 border-border-default rounded-r text-sm text-text-tertiary whitespace-nowrap">
                {fileSuffix}
              </span>
            </div>
          </div>

          {/* Format */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">{t.format}</label>
            <Select
              value={format}
              onChange={(v) => setFormat(v as OutputFormat)}
              options={[
                { value: "png", label: "PNG" },
                { value: "webp", label: "WebP" },
                { value: "jpeg", label: "JPEG" },
              ]}
              size="sm"
            />
          </div>

          {/* Quality (non-PNG only) */}
          {format !== "png" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary">
                {t.quality}: {Math.round(quality * 100)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={quality}
                onChange={(e) => setQuality(parseFloat(e.target.value))}
                className="w-full accent-accent-primary"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleExport}
            disabled={!fileName.trim()}
            className="px-3 py-1.5 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
          >
            {t.export}
          </button>
        </div>
      </div>
    </div>
  );
}
