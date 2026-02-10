"use client";

import { useState, useEffect, useCallback } from "react";
import { ExportModal, Select } from "@/shared/components";

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

  return (
    <ExportModal
      isOpen={isOpen}
      onClose={onClose}
      onExport={handleExport}
      title={t.export}
      fileName={fileName}
      onFileNameChange={setFileName}
      fileSuffix={`.${format}`}
      fileNameLabel={t.fileName}
      formatLabel={t.format}
      formatOptions={[
        { value: "mp4", label: "MP4 (H.264/AAC)" },
        { value: "mov", label: "MOV (H.264/AAC, QuickTime)" },
      ]}
      formatValue={format}
      onFormatChange={(value) => setFormat(value as VideoExportFormat)}
      isExporting={isExporting}
      exportProgress={exportProgress}
      cancelLabel={t.cancel}
      exportLabel={t.export}
    >
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
          disabled={isExporting}
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
    </ExportModal>
  );
}
