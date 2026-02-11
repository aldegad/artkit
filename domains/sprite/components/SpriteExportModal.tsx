"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ExportModal, Select, ExportCanvasSizeControls } from "@/shared/components";
import type { SpriteExportProgressState } from "../hooks/useSpriteExport";
import type { SpriteExportFrameSize } from "../utils/export";

// ============================================
// Types
// ============================================

export type SpriteExportType = "zip" | "sprite-png" | "sprite-webp" | "mp4" | "optimized-zip";
export type OptimizedTargetFramework = "canvas" | "phaser" | "pixi" | "custom";

export interface SpriteExportSettings {
  exportType: SpriteExportType;
  fileName: string;
  frameSize: SpriteExportFrameSize | null;
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
  // Optimized ZIP
  optimizedTarget: OptimizedTargetFramework;
  optimizedThreshold: number;
  optimizedIncludeGuide: boolean;
  optimizedImageFormat: "png" | "webp";
  optimizedWebpQuality: number;
  optimizedTileSize: number;
}

// Settings saved to localStorage (excludes fileName)
interface SavedExportSettings {
  exportType: SpriteExportType;
  useSourceSize: boolean;
  keepAspectRatio: boolean;
  customFrameWidth: number;
  customFrameHeight: number;
  padding: number;
  bgTransparent: boolean;
  backgroundColor: string;
  webpQuality: number;
  mp4Fps: number;
  mp4Compression: "high" | "balanced" | "small";
  mp4BackgroundColor: string;
  mp4LoopCount: number;
  optimizedTarget: OptimizedTargetFramework;
  optimizedThreshold: number;
  optimizedIncludeGuide: boolean;
  optimizedImageFormat: "png" | "webp";
  optimizedWebpQuality: number;
  optimizedTileSize: number;
}

const STORAGE_KEY = "sprite-export-settings";
const DEFAULT_MAX_FRAME_SIZE = 16384;

const DEFAULT_SAVED: SavedExportSettings = {
  exportType: "sprite-png",
  useSourceSize: true,
  keepAspectRatio: true,
  customFrameWidth: 0,
  customFrameHeight: 0,
  padding: 0,
  bgTransparent: true,
  backgroundColor: "#ffffff",
  webpQuality: 0.95,
  mp4Fps: 12,
  mp4Compression: "balanced",
  mp4BackgroundColor: "#000000",
  mp4LoopCount: 1,
  optimizedTarget: "canvas",
  optimizedThreshold: 0,
  optimizedIncludeGuide: true,
  optimizedImageFormat: "webp",
  optimizedWebpQuality: 0.9,
  optimizedTileSize: 32,
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

function normalizeSize(
  size: SpriteExportFrameSize | null | undefined,
): SpriteExportFrameSize | null {
  if (!size) return null;
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) return null;
  const width = Math.max(1, Math.floor(size.width));
  const height = Math.max(1, Math.floor(size.height));
  return { width, height };
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
    case "optimized-zip":
      return ".zip";
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
  defaultFrameSize: SpriteExportFrameSize | null;
  sourceFrameSize: SpriteExportFrameSize | null;
  isExporting: boolean;
  exportProgress: SpriteExportProgressState | null;
  maxFrameSize?: number;
  translations: {
    export: string;
    cancel: string;
    exportType: string;
    exportTypeZip: string;
    exportTypeSpriteSheetPng: string;
    exportTypeSpriteSheetWebp: string;
    exportTypeMp4: string;
    exportFileName: string;
    exportCanvasSize: string;
    exportUseSourceSize: string;
    exportWidth: string;
    exportHeight: string;
    exportKeepAspectRatio: string;
    exportCanvasSizeLimit: string;
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
    exportTypeOptimizedZip: string;
    exportOptimizedTarget: string;
    exportOptimizedThreshold: string;
    exportOptimizedThresholdHint: string;
    exportOptimizedIncludeGuide: string;
    exportOptimizedImageFormat: string;
    exportOptimizedFormatPng: string;
    exportOptimizedFormatWebp: string;
    exportOptimizedTileSize: string;
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
  defaultFrameSize,
  sourceFrameSize,
  isExporting,
  exportProgress,
  maxFrameSize = DEFAULT_MAX_FRAME_SIZE,
  translations: t,
}: SpriteExportModalProps) {
  const normalizedDefaultFrameSize = useMemo(
    () => normalizeSize(defaultFrameSize),
    [defaultFrameSize],
  );
  const normalizedSourceFrameSize = useMemo(
    () => normalizeSize(sourceFrameSize),
    [sourceFrameSize],
  );
  const fallbackCustomSize = normalizedDefaultFrameSize ?? normalizedSourceFrameSize;
  const referenceAspectRatio = useMemo(() => {
    const ref = normalizedSourceFrameSize ?? fallbackCustomSize;
    if (!ref || ref.width <= 0 || ref.height <= 0) return null;
    return ref.width / ref.height;
  }, [normalizedSourceFrameSize, fallbackCustomSize]);

  const clampDimension = useCallback(
    (value: number): number => {
      if (!Number.isFinite(value)) return 1;
      return Math.min(maxFrameSize, Math.max(1, Math.round(value)));
    },
    [maxFrameSize],
  );

  const [fileName, setFileName] = useState(defaultFileName);
  const [exportType, setExportType] = useState<SpriteExportType>("sprite-png");
  const [useSourceSize, setUseSourceSize] = useState(true);
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [widthInput, setWidthInput] = useState("");
  const [heightInput, setHeightInput] = useState("");
  const [sizeError, setSizeError] = useState("");
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
  const [optimizedTarget, setOptimizedTarget] = useState<OptimizedTargetFramework>("canvas");
  const [optimizedThreshold, setOptimizedThreshold] = useState(0);
  const [optimizedIncludeGuide, setOptimizedIncludeGuide] = useState(true);
  const [optimizedImageFormat, setOptimizedImageFormat] = useState<"png" | "webp">("webp");
  const [optimizedWebpQuality, setOptimizedWebpQuality] = useState(0.9);
  const [optimizedTileSize, setOptimizedTileSize] = useState(32);

  useEffect(() => {
    if (!isOpen) return;

    const saved = loadSavedSettings();
    const canUseSourceSize = Boolean(normalizedSourceFrameSize);
    const initialUseSource = canUseSourceSize ? saved.useSourceSize : false;
    const fallbackWidth = fallbackCustomSize?.width ?? "";
    const fallbackHeight = fallbackCustomSize?.height ?? "";
    const customWidth = saved.customFrameWidth > 0 ? clampDimension(saved.customFrameWidth) : fallbackWidth;
    const customHeight = saved.customFrameHeight > 0 ? clampDimension(saved.customFrameHeight) : fallbackHeight;

    setFileName(defaultFileName);
    setExportType(saved.exportType);
    setUseSourceSize(initialUseSource);
    setKeepAspectRatio(saved.keepAspectRatio);
    setWidthInput(String(customWidth));
    setHeightInput(String(customHeight));
    setSizeError("");
    setPadding(saved.padding);
    setBgTransparent(saved.bgTransparent);
    setBackgroundColor(saved.backgroundColor);
    setWebpQuality(saved.webpQuality);
    setMp4Fps(saved.mp4Fps || currentFps || 12);
    setMp4Compression(saved.mp4Compression);
    setMp4BackgroundColor(saved.mp4BackgroundColor);
    setMp4LoopCount(saved.mp4LoopCount);
    setOptimizedTarget(saved.optimizedTarget);
    setOptimizedThreshold(saved.optimizedThreshold);
    setOptimizedIncludeGuide(saved.optimizedIncludeGuide);
    setOptimizedImageFormat(saved.optimizedImageFormat);
    setOptimizedWebpQuality(saved.optimizedWebpQuality);
    setOptimizedTileSize(saved.optimizedTileSize);
  }, [
    isOpen,
    defaultFileName,
    currentFps,
    normalizedSourceFrameSize,
    fallbackCustomSize,
    clampDimension,
  ]);

  const handleUseSourceSizeChange = useCallback(
    (next: boolean) => {
      setSizeError("");
      if (next && !normalizedSourceFrameSize) {
        setUseSourceSize(false);
        return;
      }
      setUseSourceSize(next);
      if (!next && (!widthInput || !heightInput) && fallbackCustomSize) {
        setWidthInput(String(fallbackCustomSize.width));
        setHeightInput(String(fallbackCustomSize.height));
      }
    },
    [normalizedSourceFrameSize, widthInput, heightInput, fallbackCustomSize],
  );

  const handleWidthInputChange = useCallback(
    (value: string) => {
      setSizeError("");
      setWidthInput(value);
      if (!keepAspectRatio || useSourceSize || !referenceAspectRatio) return;

      const width = Number.parseInt(value, 10);
      if (!Number.isFinite(width) || width <= 0) {
        setHeightInput("");
        return;
      }
      setHeightInput(String(clampDimension(width / referenceAspectRatio)));
    },
    [keepAspectRatio, useSourceSize, referenceAspectRatio, clampDimension],
  );

  const handleHeightInputChange = useCallback(
    (value: string) => {
      setSizeError("");
      setHeightInput(value);
      if (!keepAspectRatio || useSourceSize || !referenceAspectRatio) return;

      const height = Number.parseInt(value, 10);
      if (!Number.isFinite(height) || height <= 0) {
        setWidthInput("");
        return;
      }
      setWidthInput(String(clampDimension(height * referenceAspectRatio)));
    },
    [keepAspectRatio, useSourceSize, referenceAspectRatio, clampDimension],
  );

  const handleKeepAspectRatioChange = useCallback(
    (next: boolean) => {
      setKeepAspectRatio(next);
      if (!next || useSourceSize || !referenceAspectRatio) return;

      const width = Number.parseInt(widthInput, 10);
      const height = Number.parseInt(heightInput, 10);
      if (Number.isFinite(width) && width > 0) {
        setHeightInput(String(clampDimension(width / referenceAspectRatio)));
        return;
      }
      if (Number.isFinite(height) && height > 0) {
        setWidthInput(String(clampDimension(height * referenceAspectRatio)));
      }
    },
    [
      useSourceSize,
      referenceAspectRatio,
      widthInput,
      heightInput,
      clampDimension,
    ],
  );

  const resolveFrameSize = useCallback((): SpriteExportFrameSize | null => {
    if (useSourceSize && normalizedSourceFrameSize) {
      return normalizedSourceFrameSize;
    }

    const width = Number.parseInt(widthInput, 10);
    const height = Number.parseInt(heightInput, 10);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return fallbackCustomSize;
    }

    return {
      width: clampDimension(width),
      height: clampDimension(height),
    };
  }, [
    useSourceSize,
    normalizedSourceFrameSize,
    widthInput,
    heightInput,
    fallbackCustomSize,
    clampDimension,
  ]);

  const handleExport = useCallback(() => {
    if (!fileName.trim() || isExporting) return;

    const resolvedFrameSize = resolveFrameSize();
    if (!resolvedFrameSize) {
      setSizeError("Canvas size is required.");
      return;
    }

    saveSettings({
      exportType,
      useSourceSize,
      keepAspectRatio,
      customFrameWidth: Number.parseInt(widthInput, 10) || resolvedFrameSize.width,
      customFrameHeight: Number.parseInt(heightInput, 10) || resolvedFrameSize.height,
      padding,
      bgTransparent,
      backgroundColor,
      webpQuality,
      mp4Fps,
      mp4Compression,
      mp4BackgroundColor,
      mp4LoopCount,
      optimizedTarget,
      optimizedThreshold,
      optimizedIncludeGuide,
      optimizedImageFormat,
      optimizedWebpQuality,
      optimizedTileSize,
    });

    onExport({
      exportType,
      fileName: fileName.trim(),
      frameSize: resolvedFrameSize,
      padding,
      bgTransparent,
      backgroundColor,
      webpQuality,
      mp4Fps,
      mp4Compression,
      mp4BackgroundColor,
      mp4LoopCount,
      optimizedTarget,
      optimizedThreshold,
      optimizedIncludeGuide,
      optimizedImageFormat,
      optimizedWebpQuality,
      optimizedTileSize,
    });
  }, [
    fileName,
    isExporting,
    resolveFrameSize,
    exportType,
    useSourceSize,
    keepAspectRatio,
    widthInput,
    heightInput,
    padding,
    bgTransparent,
    backgroundColor,
    webpQuality,
    mp4Fps,
    mp4Compression,
    mp4BackgroundColor,
    mp4LoopCount,
    optimizedTarget,
    optimizedThreshold,
    optimizedIncludeGuide,
    optimizedImageFormat,
    optimizedWebpQuality,
    optimizedTileSize,
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
        { value: "optimized-zip", label: t.exportTypeOptimizedZip },
      ]}
      formatValue={exportType}
      onFormatChange={(value) => {
        setSizeError("");
        setExportType(value as SpriteExportType);
      }}
      isExporting={isExporting}
      exportProgress={exportProgress}
      cancelLabel={t.cancel}
      exportLabel={t.export}
      exportingLabel={t.exporting}
    >
      <ExportCanvasSizeControls
        sourceSize={normalizedSourceFrameSize}
        useSourceSize={useSourceSize}
        onUseSourceSizeChange={handleUseSourceSizeChange}
        widthInput={widthInput}
        heightInput={heightInput}
        onWidthInputChange={handleWidthInputChange}
        onHeightInputChange={handleHeightInputChange}
        keepAspectRatio={keepAspectRatio}
        onKeepAspectRatioChange={handleKeepAspectRatioChange}
        disabled={isExporting}
        labels={{
          canvasSize: t.exportCanvasSize,
          useSourceSize: t.exportUseSourceSize,
          width: t.exportWidth,
          height: t.exportHeight,
          keepAspectRatio: t.exportKeepAspectRatio,
          sizeLimitHint: t.exportCanvasSizeLimit.replace("{max}", String(maxFrameSize)),
        }}
      />

      {sizeError && (
        <p className="text-[11px] text-red-500">{sizeError}</p>
      )}

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

      {/* Optimized ZIP Options */}
      {exportType === "optimized-zip" && (
        <>
          {/* Target Framework */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">
              {t.exportOptimizedTarget}
            </label>
            <Select
              value={optimizedTarget}
              onChange={(value) =>
                setOptimizedTarget(value as OptimizedTargetFramework)
              }
              options={[
                { value: "canvas", label: "Canvas API" },
                { value: "phaser", label: "Phaser 3" },
                { value: "pixi", label: "PixiJS" },
                { value: "custom", label: "Custom / Other" },
              ]}
              size="sm"
              disabled={isExporting}
            />
          </div>

          {/* Threshold */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">
              {t.exportOptimizedThreshold} ({optimizedThreshold})
            </label>
            <input
              type="range"
              min={0}
              max={20}
              value={optimizedThreshold}
              onChange={(e) => setOptimizedThreshold(Number(e.target.value))}
              disabled={isExporting}
              className="w-full accent-accent-primary"
            />
            <p className="text-[11px] text-text-tertiary">
              {t.exportOptimizedThresholdHint}
            </p>
          </div>

          {/* Tile Size */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">
              {t.exportOptimizedTileSize} ({optimizedTileSize}px)
            </label>
            <input
              type="range"
              min={8}
              max={64}
              step={1}
              value={optimizedTileSize}
              onChange={(e) => setOptimizedTileSize(Number(e.target.value))}
              disabled={isExporting}
              className="w-full accent-accent-primary"
            />
          </div>

          {/* Include Guide */}
          <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={optimizedIncludeGuide}
              onChange={(e) => setOptimizedIncludeGuide(e.target.checked)}
              disabled={isExporting}
              className="accent-accent-primary"
            />
            {t.exportOptimizedIncludeGuide}
          </label>

          {/* Image Format */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">
              {t.exportOptimizedImageFormat}
            </label>
            <Select
              value={optimizedImageFormat}
              onChange={(value) => setOptimizedImageFormat(value as "png" | "webp")}
              options={[
                { value: "webp", label: t.exportOptimizedFormatWebp },
                { value: "png", label: t.exportOptimizedFormatPng },
              ]}
              size="sm"
              disabled={isExporting}
            />
          </div>

          {/* WebP Quality */}
          {optimizedImageFormat === "webp" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary">
                {t.quality} ({Math.round(optimizedWebpQuality * 100)}%)
              </label>
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(optimizedWebpQuality * 100)}
                onChange={(e) => setOptimizedWebpQuality(Number(e.target.value) / 100)}
                disabled={isExporting}
                className="w-full accent-accent-primary"
              />
            </div>
          )}
        </>
      )}
    </ExportModal>
  );
}
