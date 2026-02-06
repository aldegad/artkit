"use client";

import { useState, useEffect, useCallback } from "react";
import { Select } from "./Select";
import { Modal } from "./Modal";

// ============================================
// Types
// ============================================

type OutputFormat = "png" | "webp" | "jpeg";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (fileName: string, format: OutputFormat, quality: number, backgroundColor: string | null) => void;
  defaultFileName: string;
  /** "single" for merged image, "layers" for per-layer ZIP */
  mode: "single" | "layers";
  translations: {
    export: string;
    cancel: string;
    fileName: string;
    format: string;
    quality: string;
    backgroundColor: string;
    transparent: string;
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
  const [useBgColor, setUseBgColor] = useState(false);
  const [bgColor, setBgColor] = useState("#ffffff");

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFileName(defaultFileName);
    }
  }, [isOpen, defaultFileName]);

  const handleExport = useCallback(() => {
    if (!fileName.trim()) return;
    onExport(fileName.trim(), format, quality, useBgColor ? bgColor : null);
    onClose();
  }, [fileName, format, quality, useBgColor, bgColor, onExport, onClose]);

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

  const ext = format === "jpeg" ? "jpg" : format;
  const fileSuffix = mode === "layers" ? ".zip" : `.${ext}`;

  const footerContent = (
    <div className="flex justify-end gap-2">
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
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.export}
      width="360px"
      contentClassName="px-4 py-3 flex flex-col gap-3"
      footer={footerContent}
    >
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

          {/* Background color */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">{t.backgroundColor}</label>
            <div className="flex flex-col gap-1.5">
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
                <span className="text-xs text-text-tertiary font-mono">{bgColor}</span>
              </label>
            </div>
          </div>
    </Modal>
  );
}
