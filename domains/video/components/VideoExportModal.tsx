"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

// ============================================
// Types
// ============================================

interface VideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (fileName: string, includeAudio: boolean) => void;
  defaultFileName: string;
  isExporting: boolean;
  translations: {
    export: string;
    cancel: string;
    fileName: string;
    includeAudio: string;
  };
}

// ============================================
// Component
// ============================================

export function VideoExportModal({
  isOpen,
  onClose,
  onExport,
  defaultFileName,
  isExporting,
  translations: t,
}: VideoExportModalProps) {
  const [fileName, setFileName] = useState(defaultFileName);
  const [includeAudio, setIncludeAudio] = useState(true);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFileName(defaultFileName);
      setIncludeAudio(true);
    }
  }, [isOpen, defaultFileName]);

  const handleExport = useCallback(() => {
    if (!fileName.trim() || isExporting) return;
    onExport(fileName.trim(), includeAudio);
  }, [fileName, includeAudio, isExporting, onExport]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleExport();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (!isExporting) onClose();
      }
    },
    [handleExport, isExporting, onClose],
  );

  if (!isOpen) return null;

  return createPortal(
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
            disabled={isExporting}
            className="p-1 rounded hover:bg-interactive-hover text-text-tertiary disabled:opacity-50"
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
                disabled={isExporting}
                autoFocus
                className="flex-1 min-w-0 px-2 py-1.5 bg-surface-secondary border border-border-default rounded-l text-sm focus:outline-none focus:border-accent-primary disabled:opacity-50"
              />
              <span className="px-2 py-1.5 bg-surface-tertiary border border-l-0 border-border-default rounded-r text-sm text-text-tertiary whitespace-nowrap">
                .mp4
              </span>
            </div>
          </div>

          {/* Include Audio */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAudio}
              onChange={(e) => setIncludeAudio(e.target.checked)}
              disabled={isExporting}
              className="accent-accent-primary"
            />
            <span className="text-sm text-text-primary">{t.includeAudio}</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-3 py-1.5 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-50"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleExport}
            disabled={!fileName.trim() || isExporting}
            className="px-3 py-1.5 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
          >
            {isExporting ? "Exporting..." : t.export}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
