"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Select, ExportCanvasSizeControls } from "@/shared/components";
import type { SpriteExportFrameSize } from "../utils/export";

export type SpriteResampleQuality = "smooth" | "balanced" | "pixel";

export interface SpriteResampleSettings {
  frameSize: SpriteExportFrameSize;
  quality: SpriteResampleQuality;
}

interface SavedResampleSettings {
  useSourceSize: boolean;
  keepAspectRatio: boolean;
  customWidth: number;
  customHeight: number;
  quality: SpriteResampleQuality;
}

interface SpriteResampleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (settings: SpriteResampleSettings) => void;
  sourceFrameSize: SpriteExportFrameSize | null;
  isResampling: boolean;
  maxFrameSize?: number;
  translations: {
    title: string;
    cancel: string;
    apply: string;
    applying: string;
    canvasSize: string;
    useSourceSize: string;
    width: string;
    height: string;
    keepAspectRatio: string;
    sizeLimitHint: string;
    quality: string;
    qualitySmooth: string;
    qualityBalanced: string;
    qualityPixel: string;
    qualityHint: string;
  };
}

const STORAGE_KEY = "sprite-resample-settings";
const DEFAULT_MAX_FRAME_SIZE = 16384;

const DEFAULT_SAVED: SavedResampleSettings = {
  useSourceSize: false,
  keepAspectRatio: true,
  customWidth: 0,
  customHeight: 0,
  quality: "smooth",
};

function loadSavedSettings(): SavedResampleSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAVED;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SAVED, ...parsed };
  } catch {
    return DEFAULT_SAVED;
  }
}

function saveSettings(settings: SavedResampleSettings): void {
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
  return {
    width: Math.max(1, Math.floor(size.width)),
    height: Math.max(1, Math.floor(size.height)),
  };
}

export default function SpriteResampleModal({
  isOpen,
  onClose,
  onApply,
  sourceFrameSize,
  isResampling,
  maxFrameSize = DEFAULT_MAX_FRAME_SIZE,
  translations: t,
}: SpriteResampleModalProps) {
  const normalizedSourceFrameSize = useMemo(
    () => normalizeSize(sourceFrameSize),
    [sourceFrameSize],
  );

  const referenceAspectRatio = useMemo(() => {
    if (!normalizedSourceFrameSize) return null;
    if (normalizedSourceFrameSize.width <= 0 || normalizedSourceFrameSize.height <= 0) return null;
    return normalizedSourceFrameSize.width / normalizedSourceFrameSize.height;
  }, [normalizedSourceFrameSize]);

  const clampDimension = useCallback(
    (value: number): number => {
      if (!Number.isFinite(value)) return 1;
      return Math.max(1, Math.min(maxFrameSize, Math.round(value)));
    },
    [maxFrameSize],
  );

  const [useSourceSize, setUseSourceSize] = useState(false);
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [widthInput, setWidthInput] = useState("");
  const [heightInput, setHeightInput] = useState("");
  const [quality, setQuality] = useState<SpriteResampleQuality>("smooth");
  const [sizeError, setSizeError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const saved = loadSavedSettings();
    const sourceWidth = normalizedSourceFrameSize?.width ?? 0;
    const sourceHeight = normalizedSourceFrameSize?.height ?? 0;
    const defaultWidth = saved.customWidth > 0 ? clampDimension(saved.customWidth) : sourceWidth;
    const defaultHeight = saved.customHeight > 0 ? clampDimension(saved.customHeight) : sourceHeight;

    setUseSourceSize(saved.useSourceSize && Boolean(normalizedSourceFrameSize));
    setKeepAspectRatio(saved.keepAspectRatio);
    setWidthInput(defaultWidth > 0 ? String(defaultWidth) : "");
    setHeightInput(defaultHeight > 0 ? String(defaultHeight) : "");
    setQuality(saved.quality);
    setSizeError("");
  }, [isOpen, normalizedSourceFrameSize, clampDimension]);

  const resolveFrameSize = useCallback((): SpriteExportFrameSize | null => {
    if (useSourceSize && normalizedSourceFrameSize) {
      return normalizedSourceFrameSize;
    }

    const width = Number.parseInt(widthInput, 10);
    const height = Number.parseInt(heightInput, 10);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return null;
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
    clampDimension,
  ]);

  const handleApply = useCallback(() => {
    if (isResampling) return;

    const frameSize = resolveFrameSize();
    if (!frameSize) {
      setSizeError("캔버스 크기를 입력하세요.");
      return;
    }

    saveSettings({
      useSourceSize,
      keepAspectRatio,
      customWidth: Number.parseInt(widthInput, 10) || frameSize.width,
      customHeight: Number.parseInt(heightInput, 10) || frameSize.height,
      quality,
    });

    onApply({ frameSize, quality });
  }, [
    isResampling,
    resolveFrameSize,
    useSourceSize,
    keepAspectRatio,
    widthInput,
    heightInput,
    quality,
    onApply,
  ]);

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

  const footer = (
    <div className="flex justify-end gap-2">
      <button
        onClick={onClose}
        disabled={isResampling}
        className="px-3 py-1.5 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-50"
      >
        {t.cancel}
      </button>
      <button
        onClick={handleApply}
        disabled={isResampling}
        className="px-3 py-1.5 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
      >
        {isResampling ? t.applying : t.apply}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={isResampling ? () => {} : onClose}
      title={t.title}
      width="420px"
      contentClassName="px-4 py-3 flex flex-col gap-3"
      footer={footer}
    >
      <ExportCanvasSizeControls
        sourceSize={normalizedSourceFrameSize}
        useSourceSize={useSourceSize}
        onUseSourceSizeChange={setUseSourceSize}
        widthInput={widthInput}
        heightInput={heightInput}
        onWidthInputChange={handleWidthInputChange}
        onHeightInputChange={handleHeightInputChange}
        keepAspectRatio={keepAspectRatio}
        onKeepAspectRatioChange={handleKeepAspectRatioChange}
        disabled={isResampling}
        labels={{
          canvasSize: t.canvasSize,
          useSourceSize: t.useSourceSize,
          width: t.width,
          height: t.height,
          keepAspectRatio: t.keepAspectRatio,
          sizeLimitHint: t.sizeLimitHint.replace("{max}", String(maxFrameSize)),
        }}
      />

      {sizeError && (
        <p className="text-[11px] text-red-500">{sizeError}</p>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">{t.quality}</label>
        <Select
          value={quality}
          onChange={(value) => setQuality(value as SpriteResampleQuality)}
          options={[
            { value: "smooth", label: t.qualitySmooth },
            { value: "balanced", label: t.qualityBalanced },
            { value: "pixel", label: t.qualityPixel },
          ]}
          size="sm"
          disabled={isResampling}
        />
        <p className="text-[11px] text-text-tertiary">{t.qualityHint}</p>
      </div>
    </Modal>
  );
}
