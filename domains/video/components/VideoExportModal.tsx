"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Select } from "@/shared/components";
import { CloseIcon } from "@/shared/components/icons";

// ============================================
// Types
// ============================================

interface VideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (fileName: string, options: VideoExportOptions) => void;
  defaultFileName: string;
  isExporting: boolean;
  exportProgress?: {
    stage: string;
    percent: number;
    detail?: string;
  } | null;
  translations: {
    export: string;
    cancel: string;
    fileName: string;
    format: string;
    includeAudio: string;
    compression: string;
    backgroundColor: string;
    compressionHighQuality: string;
    compressionBalanced: string;
    compressionSmallFile: string;
  };
}

export type VideoExportFormat = "mp4" | "mov";
export type VideoExportCompression = "high" | "balanced" | "small";

export interface VideoExportOptions {
  format: VideoExportFormat;
  includeAudio: boolean;
  compression: VideoExportCompression;
  backgroundColor: string;
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
  exportProgress,
  translations: t,
}: VideoExportModalProps) {
  const [fileName, setFileName] = useState(defaultFileName);
  const [format, setFormat] = useState<VideoExportFormat>("mp4");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [compression, setCompression] = useState<VideoExportCompression>("balanced");
  const [backgroundColor, setBackgroundColor] = useState("#000000");

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFileName(defaultFileName);
      setFormat("mp4");
      setIncludeAudio(true);
      setCompression("balanced");
      setBackgroundColor("#000000");
    }
  }, [isOpen, defaultFileName]);

  const handleExport = useCallback(() => {
    if (!fileName.trim() || isExporting) return;
    onExport(fileName.trim(), {
      format,
      includeAudio,
      compression,
      backgroundColor,
    });
  }, [fileName, format, includeAudio, compression, backgroundColor, isExporting, onExport]);

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
            <CloseIcon />
          </button>
        </div>

        {/* Progress */}
        {isExporting && exportProgress && (
          <div className="px-4 py-2 border-b border-border-default bg-surface-secondary">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
              <span>{exportProgress.stage}</span>
            </div>
            {exportProgress.detail && (
              <div className="mt-0.5 text-xs text-text-tertiary truncate">
                {exportProgress.detail}
              </div>
            )}
            <div className="mt-1 w-full h-1 bg-surface-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, exportProgress.percent))}%` }}
              />
            </div>
          </div>
        )}

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
                .{format}
              </span>
            </div>
          </div>

          {/* Format */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">{t.format}</label>
            <Select
              value={format}
              onChange={(value) => setFormat(value as VideoExportFormat)}
              options={[
                { value: "mp4", label: "MP4 (H.264/AAC)" },
                { value: "mov", label: "MOV (H.264/AAC, QuickTime)" },
              ]}
              size="sm"
            />
          </div>

          {/* Compression */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">{t.compression}</label>
            <Select
              value={compression}
              onChange={(value) => setCompression(value as VideoExportCompression)}
              options={[
                { value: "high", label: t.compressionHighQuality },
                { value: "balanced", label: t.compressionBalanced },
                { value: "small", label: t.compressionSmallFile },
              ]}
              size="sm"
            />
          </div>

          {/* Background Color */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">{t.backgroundColor}</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                disabled={isExporting}
                className="w-8 h-8 rounded border border-border-default cursor-pointer bg-transparent disabled:opacity-50"
              />
              <span className="text-xs text-text-tertiary font-mono">{backgroundColor}</span>
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
