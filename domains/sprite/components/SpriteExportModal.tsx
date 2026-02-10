"use client";

import { useState, useEffect, useCallback } from "react";
import { ExportModal, Select } from "@/shared/components";
import type { SpriteExportProgressState } from "../hooks/useSpriteExport";

// ============================================
// Types
// ============================================

export type SpriteExportType = "zip" | "sprite-png" | "sprite-webp" | "mp4";

export interface SpriteExportSettings {
  exportType: SpriteExportType;
  fileName: string;
  // Sprite Sheet
  padding: number;
  bgTransparent: boolean;
  backgroundColor: string;
  webpQuality: number;
  // MP4
  mp4Fps: number;
  mp4Compression: "high" | "balanced" | "small";
  mp4BackgroundColor: string;
  mp4LoopCount: number;
}

// Settings saved to localStorage (excludes fileName)
interface SavedExportSettings {
  exportType: SpriteExportType;
  padding: number;
  bgTransparent: boolean;
  backgroundColor: string;
  webpQuality: number;
  mp4Fps: number;
  mp4Compression: "high" | "balanced" | "small";
  mp4BackgroundColor: string;
  mp4LoopCount: number;
}

const STORAGE_KEY = "sprite-export-settings";

const DEFAULT_SAVED: SavedExportSettings = {
  exportType: "sprite-png",
  padding: 0,
  bgTransparent: true,
  backgroundColor: "#ffffff",
  webpQuality: 0.95,
  mp4Fps: 12,
  mp4Compression: "balanced",
  mp4BackgroundColor: "#000000",
  mp4LoopCount: 1,
};

function loadSavedSettings(): SavedExportSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAVED;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SAVED, ...parsed };
  } catch {
    return DEFAULT_SAVED;
  }
}

function saveSettings(settings: SavedExportSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function getExtension(type: SpriteExportType): string {
  switch (type) {
    case "zip":
      return ".zip";
    case "sprite-png":
      return ".png";
    case "sprite-webp":
      return ".webp";
    case "mp4":
      return ".mp4";
  }
}

// ============================================
// Props
// ============================================

interface SpriteExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: SpriteExportSettings) => void;
  defaultFileName: string;
  currentFps: number;
  isExporting: boolean;
  exportProgress: SpriteExportProgressState | null;
  translations: {
    export: string;
    cancel: string;
    exportType: string;
    exportTypeZip: string;
    exportTypeSpriteSheetPng: string;
    exportTypeSpriteSheetWebp: string;
    exportTypeMp4: string;
    exportFileName: string;
    exportPadding: string;
    backgroundColor: string;
    exportBgTransparent: string;
    quality: string;
    compression: string;
    compressionHighQuality: string;
    compressionBalanced: string;
    compressionSmallFile: string;
    exportLoopCount: string;
    exporting: string;
  };
}

// ============================================
// Component
// ============================================

export default function SpriteExportModal({
  isOpen,
  onClose,
  onExport,
  defaultFileName,
  currentFps,
  isExporting,
  exportProgress,
  translations: t,
}: SpriteExportModalProps) {
  const [fileName, setFileName] = useState(defaultFileName);
  const [exportType, setExportType] = useState<SpriteExportType>("sprite-png");
  const [padding, setPadding] = useState(0);
  const [bgTransparent, setBgTransparent] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [webpQuality, setWebpQuality] = useState(0.95);
  const [mp4Fps, setMp4Fps] = useState(12);
  const [mp4Compression, setMp4Compression] = useState<
    "high" | "balanced" | "small"
  >("balanced");
  const [mp4BackgroundColor, setMp4BackgroundColor] = useState("#000000");
  const [mp4LoopCount, setMp4LoopCount] = useState(1);

  // Load settings from localStorage when modal opens
  useEffect(() => {
    if (isOpen) {
      const saved = loadSavedSettings();
      setFileName(defaultFileName);
      setExportType(saved.exportType);
      setPadding(saved.padding);
      setBgTransparent(saved.bgTransparent);
      setBackgroundColor(saved.backgroundColor);
      setWebpQuality(saved.webpQuality);
      setMp4Fps(saved.mp4Fps || currentFps || 12);
      setMp4Compression(saved.mp4Compression);
      setMp4BackgroundColor(saved.mp4BackgroundColor);
      setMp4LoopCount(saved.mp4LoopCount);
    }
  }, [isOpen, defaultFileName, currentFps]);

  const handleExport = useCallback(() => {
    if (!fileName.trim() || isExporting) return;

    // Save settings (excluding fileName)
    saveSettings({
      exportType,
      padding,
      bgTransparent,
      backgroundColor,
      webpQuality,
      mp4Fps,
      mp4Compression,
      mp4BackgroundColor,
      mp4LoopCount,
    });

    onExport({
      exportType,
      fileName: fileName.trim(),
      padding,
      bgTransparent,
      backgroundColor,
      webpQuality,
      mp4Fps,
      mp4Compression,
      mp4BackgroundColor,
      mp4LoopCount,
    });
  }, [
    fileName,
    exportType,
    padding,
    bgTransparent,
    backgroundColor,
    webpQuality,
    mp4Fps,
    mp4Compression,
    mp4BackgroundColor,
    mp4LoopCount,
    isExporting,
    onExport,
  ]);

  const isSpriteSheet =
    exportType === "sprite-png" || exportType === "sprite-webp";

  return (
    <ExportModal
      isOpen={isOpen}
      onClose={onClose}
      onExport={handleExport}
      title={t.export}
      fileName={fileName}
      onFileNameChange={setFileName}
      fileSuffix={getExtension(exportType)}
      fileNameLabel={t.exportFileName}
      formatLabel={t.exportType}
      formatOptions={[
        { value: "zip", label: t.exportTypeZip },
        { value: "sprite-png", label: t.exportTypeSpriteSheetPng },
        { value: "sprite-webp", label: t.exportTypeSpriteSheetWebp },
        { value: "mp4", label: t.exportTypeMp4 },
      ]}
      formatValue={exportType}
      onFormatChange={(value) => setExportType(value as SpriteExportType)}
      isExporting={isExporting}
      exportProgress={exportProgress}
      cancelLabel={t.cancel}
      exportLabel={t.export}
      exportingLabel={t.exporting}
    >
      {/* Sprite Sheet Options */}
      {isSpriteSheet && (
        <>
          {/* Padding */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">
              {t.exportPadding} ({padding}px)
            </label>
            <input
              type="range"
              min={0}
              max={32}
              value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
              disabled={isExporting}
              className="w-full accent-accent-primary"
            />
          </div>

          {/* Background Color */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">
              {t.backgroundColor}
            </label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={bgTransparent}
                  onChange={(e) => setBgTransparent(e.target.checked)}
                  disabled={isExporting}
                  className="accent-accent-primary"
                />
                {t.exportBgTransparent}
              </label>
              {!bgTransparent && (
                <>
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    disabled={isExporting}
                    className="w-8 h-8 rounded border border-border-default cursor-pointer bg-transparent disabled:opacity-50"
                  />
                  <span className="text-xs text-text-tertiary font-mono">
                    {backgroundColor}
                  </span>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* WebP Quality */}
      {exportType === "sprite-webp" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">
            {t.quality} ({Math.round(webpQuality * 100)}%)
          </label>
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(webpQuality * 100)}
            onChange={(e) => setWebpQuality(Number(e.target.value) / 100)}
            disabled={isExporting}
            className="w-full accent-accent-primary"
          />
        </div>
      )}

      {/* MP4 Options */}
      {exportType === "mp4" && (
        <>
          {/* FPS */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">FPS</label>
            <input
              type="number"
              min={1}
              max={60}
              value={mp4Fps}
              onChange={(e) =>
                setMp4Fps(Math.max(1, Math.min(60, Number(e.target.value))))
              }
              disabled={isExporting}
              className="w-20 px-2 py-1.5 bg-surface-secondary border border-border-default rounded text-sm focus:outline-none focus:border-accent-primary disabled:opacity-50"
            />
          </div>

          {/* Compression */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">
              {t.compression}
            </label>
            <Select
              value={mp4Compression}
              onChange={(value) =>
                setMp4Compression(value as "high" | "balanced" | "small")
              }
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
            <label className="text-xs text-text-secondary">
              {t.backgroundColor}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={mp4BackgroundColor}
                onChange={(e) => setMp4BackgroundColor(e.target.value)}
                disabled={isExporting}
                className="w-8 h-8 rounded border border-border-default cursor-pointer bg-transparent disabled:opacity-50"
              />
              <span className="text-xs text-text-tertiary font-mono">
                {mp4BackgroundColor}
              </span>
            </div>
          </div>

          {/* Loop Count */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">
              {t.exportLoopCount}
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={mp4LoopCount}
              onChange={(e) =>
                setMp4LoopCount(
                  Math.max(1, Math.min(100, Number(e.target.value))),
                )
              }
              disabled={isExporting}
              className="w-20 px-2 py-1.5 bg-surface-secondary border border-border-default rounded text-sm focus:outline-none focus:border-accent-primary disabled:opacity-50"
            />
          </div>
        </>
      )}
    </ExportModal>
  );
}
