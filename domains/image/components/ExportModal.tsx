"use client";

import { useState, useEffect, useCallback } from "react";
import { ExportModal as ExportModalBase, Select } from "@/shared/components";
import type { ImageExportMode } from "../hooks/useImageExport";

// ============================================
// Types
// ============================================

type OutputFormat = "png" | "webp" | "jpeg";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (
    fileName: string,
    format: OutputFormat,
    quality: number,
    backgroundColor: string | null,
    mode: ImageExportMode
  ) => void;
  defaultFileName: string;
  mode: ImageExportMode;
  onModeChange: (mode: ImageExportMode) => void;
  translations: {
    export: string;
    exportMode: string;
    exportSingleImage: string;
    exportLayers: string;
    exportSpriteSheet: string;
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
  onModeChange,
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
    onExport(fileName.trim(), format, quality, useBgColor ? bgColor : null, mode);
    onClose();
  }, [fileName, format, quality, useBgColor, bgColor, mode, onExport, onClose]);

  const ext = format === "jpeg" ? "jpg" : format;
  const fileSuffix = mode === "layers" ? ".zip" : `.${ext}`;

  return (
    <ExportModalBase
      isOpen={isOpen}
      onClose={onClose}
      onExport={handleExport}
      title={t.export}
      fileName={fileName}
      onFileNameChange={setFileName}
      fileSuffix={fileSuffix}
      fileNameLabel={t.fileName}
      formatLabel={t.format}
      formatOptions={[
        { value: "png", label: "PNG" },
        { value: "webp", label: "WebP" },
        { value: "jpeg", label: "JPEG" },
      ]}
      formatValue={format}
      onFormatChange={(v) => setFormat(v as OutputFormat)}
      cancelLabel={t.cancel}
      exportLabel={t.export}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">{t.exportMode}</label>
        <Select<ImageExportMode>
          value={mode}
          onChange={(value) => onModeChange(value as ImageExportMode)}
          options={[
            { value: "single", label: t.exportSingleImage },
            { value: "layers", label: t.exportLayers },
            { value: "sprite", label: t.exportSpriteSheet },
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
    </ExportModalBase>
  );
}
