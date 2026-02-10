"use client";

import { useEffect, useCallback } from "react";
import { Modal } from "./Modal";
import { Select } from "./Select";
import type { SelectOption } from "./Select";

// ============================================
// Types
// ============================================

export interface ExportProgress {
  stage: string;
  percent: number;
  detail?: string;
}

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: () => void;
  title: string;
  // File name
  fileName: string;
  onFileNameChange: (name: string) => void;
  fileSuffix: string;
  fileNameLabel: string;
  // Format
  formatLabel: string;
  formatOptions: SelectOption<string>[];
  formatValue: string;
  onFormatChange: (value: string) => void;
  // State
  isExporting?: boolean;
  exportProgress?: ExportProgress | null;
  exportDisabled?: boolean;
  // Labels
  cancelLabel: string;
  exportLabel: string;
  exportingLabel?: string;
  // Domain-specific options
  children?: React.ReactNode;
}

// ============================================
// Component
// ============================================

export function ExportModal({
  isOpen,
  onClose,
  onExport,
  title,
  fileName,
  onFileNameChange,
  fileSuffix,
  fileNameLabel,
  formatLabel,
  formatOptions,
  formatValue,
  onFormatChange,
  isExporting = false,
  exportProgress,
  exportDisabled = false,
  cancelLabel,
  exportLabel,
  exportingLabel = "Exporting...",
  children,
}: ExportModalProps) {
  const canExport = !!fileName.trim() && !isExporting && !exportDisabled;

  const handleExport = useCallback(() => {
    if (!canExport) return;
    onExport();
  }, [canExport, onExport]);

  const handleClose = useCallback(() => {
    if (isExporting) return;
    onClose();
  }, [isExporting, onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleExport();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleExport]);

  const footerContent = (
    <div className="flex justify-end gap-2">
      <button
        onClick={handleClose}
        disabled={isExporting}
        className="px-3 py-1.5 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-50"
      >
        {cancelLabel}
      </button>
      <button
        onClick={handleExport}
        disabled={!canExport}
        className="px-3 py-1.5 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
      >
        {isExporting ? exportingLabel : exportLabel}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      width="360px"
      contentClassName="flex flex-col gap-0"
      footer={footerContent}
    >
      {/* Progress */}
      {isExporting && (
        <div className="px-4 py-2 border-b border-border-default bg-surface-secondary">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin shrink-0" />
            <span>{exportProgress?.stage ?? exportingLabel}</span>
          </div>
          {exportProgress?.detail && (
            <div className="mt-0.5 text-xs text-text-tertiary truncate">
              {exportProgress.detail}
            </div>
          )}
          {exportProgress && (
            <div className="mt-1 w-full h-1 bg-surface-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, exportProgress.percent))}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-3 flex flex-col gap-3">
        {/* File name */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">{fileNameLabel}</label>
          <div className="flex items-center gap-0">
            <input
              type="text"
              value={fileName}
              onChange={(e) => onFileNameChange(e.target.value)}
              disabled={isExporting}
              autoFocus
              className="flex-1 min-w-0 px-2 py-1.5 bg-surface-secondary border border-border-default rounded-l text-sm focus:outline-none focus:border-accent-primary disabled:opacity-50"
            />
            <span className="px-2 py-1.5 bg-surface-tertiary border border-l-0 border-border-default rounded-r text-sm text-text-tertiary whitespace-nowrap">
              {fileSuffix}
            </span>
          </div>
        </div>

        {/* Format */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">{formatLabel}</label>
          <Select
            value={formatValue}
            onChange={onFormatChange}
            options={formatOptions}
            size="sm"
            disabled={isExporting}
          />
        </div>

        {/* Domain-specific options */}
        {children}
      </div>
    </Modal>
  );
}
