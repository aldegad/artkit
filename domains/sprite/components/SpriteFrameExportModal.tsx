"use client";

import { useState, useEffect, useCallback } from "react";
import { ExportModal as ExportModalBase } from "@/shared/components";
import type {
  SpriteCurrentFrameExportSettings,
  SpriteFrameExportFormat,
} from "../hooks/useSpriteExportActions";

// ============================================
// Props
// ============================================

interface SpriteFrameExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: SpriteCurrentFrameExportSettings) => void | Promise<void>;
  defaultFileName: string;
  translations: {
    title: string;
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

export default function SpriteFrameExportModal({
  isOpen,
  onClose,
  onExport,
  defaultFileName,
  translations: t,
}: SpriteFrameExportModalProps) {
  const [fileName, setFileName] = useState(defaultFileName);
  const [format, setFormat] = useState<SpriteFrameExportFormat>("png");
  const [quality, setQuality] = useState(0.9);
  const [useBgColor, setUseBgColor] = useState(false);
  const [bgColor, setBgColor] = useState("#ffffff");

  useEffect(() => {
    if (!isOpen) return;
    setFileName(defaultFileName);
  }, [isOpen, defaultFileName]);

  const handleExport = useCallback(() => {
    if (!fileName.trim()) return;
    void onExport({
      fileName: fileName.trim(),
      format,
      quality,
      backgroundColor: useBgColor ? bgColor : null,
    });
    onClose();
  }, [bgColor, fileName, format, onClose, onExport, quality, useBgColor]);

  const ext = format === "jpeg" ? "jpg" : format;

  return (
    <ExportModalBase
      isOpen={isOpen}
      onClose={onClose}
      onExport={handleExport}
      title={t.title}
      fileName={fileName}
      onFileNameChange={setFileName}
      fileSuffix={`.${ext}`}
      fileNameLabel={t.fileName}
      formatLabel={t.format}
      formatOptions={[
        { value: "png", label: "PNG" },
        { value: "webp", label: "WebP" },
        { value: "jpeg", label: "JPEG" },
      ]}
      formatValue={format}
      onFormatChange={(value) => setFormat(value as SpriteFrameExportFormat)}
      cancelLabel={t.cancel}
      exportLabel={t.export}
    >
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

      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">{t.backgroundColor}</label>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="spriteFrameExportBgMode"
              checked={!useBgColor}
              onChange={() => setUseBgColor(false)}
              className="accent-accent-primary"
            />
            <span className="text-sm text-text-primary">{t.transparent}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="spriteFrameExportBgMode"
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
