"use client";

import { useState, useEffect, useCallback } from "react";
import { ExportModal } from "@/shared/components";

// ============================================
// Types
// ============================================

interface VideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (fileName: string, format: VideoExportFormat, includeAudio: boolean) => void;
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
  };
}

export type VideoExportFormat = "mp4" | "mov";

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

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFileName(defaultFileName);
      setFormat("mp4");
      setIncludeAudio(true);
    }
  }, [isOpen, defaultFileName]);

  const handleExport = useCallback(() => {
    if (!fileName.trim() || isExporting) return;
    onExport(fileName.trim(), format, includeAudio);
  }, [fileName, format, includeAudio, isExporting, onExport]);

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
      onFormatChange={(v) => setFormat(v as VideoExportFormat)}
      isExporting={isExporting}
      exportProgress={exportProgress}
      cancelLabel={t.cancel}
      exportLabel={t.export}
    >
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
