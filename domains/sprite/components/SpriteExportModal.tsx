"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/shared/components";
import type { SpriteExportFrameSize } from "../utils/export";

export type SpriteExportType = "zip-png" | "sheet-png" | "sheet-webp";

export interface SpriteExportOptions {
  fileName: string;
  appendFrameCount: boolean;
  frameSize: SpriteExportFrameSize | null;
}

interface SpriteExportModalProps {
  isOpen: boolean;
  exportType: SpriteExportType;
  defaultFileName: string;
  defaultFrameSize: SpriteExportFrameSize | null;
  originalFrameSize?: SpriteExportFrameSize | null;
  estimatedFrameCount: number;
  onClose: () => void;
  onConfirm: (options: SpriteExportOptions) => Promise<void> | void;
  maxFrameSize?: number;
}

const DEFAULT_MAX_FRAME_SIZE = 16384;

function getExportLabel(type: SpriteExportType): string {
  if (type === "zip-png") return "PNG ZIP";
  if (type === "sheet-webp") return "Sprite Sheet (WebP)";
  return "Sprite Sheet (PNG)";
}

function getExportExtension(type: SpriteExportType): string {
  if (type === "zip-png") return "zip";
  if (type === "sheet-webp") return "webp";
  return "png";
}

export default function SpriteExportModal({
  isOpen,
  exportType,
  defaultFileName,
  defaultFrameSize,
  originalFrameSize = null,
  estimatedFrameCount,
  onClose,
  onConfirm,
  maxFrameSize = DEFAULT_MAX_FRAME_SIZE,
}: SpriteExportModalProps) {
  const [fileName, setFileName] = useState("");
  const [appendFrameCount, setAppendFrameCount] = useState(true);
  const [useOriginalFrameSize, setUseOriginalFrameSize] = useState(true);
  const [keepOriginalAspectRatio, setKeepOriginalAspectRatio] = useState(true);
  const [widthInput, setWidthInput] = useState("");
  const [heightInput, setHeightInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const safeDefaultFileName = useMemo(
    () => defaultFileName.trim() || "sprite-project",
    [defaultFileName],
  );

  const normalizedDefaultFrameSize = useMemo(() => {
    if (!defaultFrameSize) return null;
    if (!Number.isFinite(defaultFrameSize.width) || !Number.isFinite(defaultFrameSize.height)) {
      return null;
    }
    const width = Math.max(1, Math.floor(defaultFrameSize.width));
    const height = Math.max(1, Math.floor(defaultFrameSize.height));
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }, [defaultFrameSize]);

  const originalAspectRatio = useMemo(() => {
    if (!originalFrameSize) return null;
    if (originalFrameSize.width <= 0 || originalFrameSize.height <= 0) return null;
    return originalFrameSize.width / originalFrameSize.height;
  }, [originalFrameSize]);

  const normalizedOriginalFrameSize = useMemo(() => {
    if (!originalFrameSize) return null;
    if (originalFrameSize.width <= 0 || originalFrameSize.height <= 0) return null;
    return {
      width: Math.max(1, Math.floor(originalFrameSize.width)),
      height: Math.max(1, Math.floor(originalFrameSize.height)),
    };
  }, [originalFrameSize]);

  const referenceAspectRatio = useMemo(() => {
    if (originalAspectRatio) return originalAspectRatio;
    if (!normalizedDefaultFrameSize) return null;
    return normalizedDefaultFrameSize.width / normalizedDefaultFrameSize.height;
  }, [normalizedDefaultFrameSize, originalAspectRatio]);

  useEffect(() => {
    if (!isOpen) return;
    setFileName(safeDefaultFileName);
    setAppendFrameCount(true);
    setKeepOriginalAspectRatio(true);
    const hasCustomFrameSize = Boolean(normalizedDefaultFrameSize);
    setUseOriginalFrameSize(!hasCustomFrameSize);
    setWidthInput(hasCustomFrameSize ? String(normalizedDefaultFrameSize?.width ?? "") : "");
    setHeightInput(hasCustomFrameSize ? String(normalizedDefaultFrameSize?.height ?? "") : "");
    setErrorMessage("");
    setIsSubmitting(false);
  }, [isOpen, safeDefaultFileName, normalizedDefaultFrameSize, exportType]);

  const clampDimension = useCallback(
    (value: number): number => {
      if (!Number.isFinite(value)) return 1;
      return Math.min(maxFrameSize, Math.max(1, Math.round(value)));
    },
    [maxFrameSize],
  );

  const handleUseOriginalFrameSizeChange = useCallback(
    (checked: boolean) => {
      setUseOriginalFrameSize(checked);
      if (checked) return;
      if (widthInput && heightInput) return;

      const fallbackSize = normalizedDefaultFrameSize ?? normalizedOriginalFrameSize;
      if (!fallbackSize) return;
      setWidthInput(String(fallbackSize.width));
      setHeightInput(String(fallbackSize.height));
    },
    [heightInput, normalizedDefaultFrameSize, normalizedOriginalFrameSize, widthInput],
  );

  const handleWidthInputChange = useCallback(
    (value: string) => {
      setWidthInput(value);
      if (!keepOriginalAspectRatio || !referenceAspectRatio || useOriginalFrameSize) return;

      const width = Number.parseInt(value, 10);
      if (!Number.isFinite(width) || width <= 0) {
        setHeightInput("");
        return;
      }

      const nextHeight = clampDimension(width / referenceAspectRatio);
      setHeightInput(String(nextHeight));
    },
    [clampDimension, keepOriginalAspectRatio, referenceAspectRatio, useOriginalFrameSize],
  );

  const handleHeightInputChange = useCallback(
    (value: string) => {
      setHeightInput(value);
      if (!keepOriginalAspectRatio || !referenceAspectRatio || useOriginalFrameSize) return;

      const height = Number.parseInt(value, 10);
      if (!Number.isFinite(height) || height <= 0) {
        setWidthInput("");
        return;
      }

      const nextWidth = clampDimension(height * referenceAspectRatio);
      setWidthInput(String(nextWidth));
    },
    [clampDimension, keepOriginalAspectRatio, referenceAspectRatio, useOriginalFrameSize],
  );

  const handleKeepOriginalAspectRatioChange = useCallback(
    (checked: boolean) => {
      setKeepOriginalAspectRatio(checked);
      if (!checked || !referenceAspectRatio || useOriginalFrameSize) return;

      const currentWidth = Number.parseInt(widthInput, 10);
      const currentHeight = Number.parseInt(heightInput, 10);
      if (Number.isFinite(currentWidth) && currentWidth > 0) {
        setHeightInput(String(clampDimension(currentWidth / referenceAspectRatio)));
        return;
      }
      if (Number.isFinite(currentHeight) && currentHeight > 0) {
        setWidthInput(String(clampDimension(currentHeight * referenceAspectRatio)));
        return;
      }
      const fallbackSize = normalizedOriginalFrameSize ?? normalizedDefaultFrameSize;
      if (fallbackSize) {
        setWidthInput(String(fallbackSize.width));
        setHeightInput(String(fallbackSize.height));
      }
    },
    [
      clampDimension,
      heightInput,
      normalizedDefaultFrameSize,
      normalizedOriginalFrameSize,
      referenceAspectRatio,
      useOriginalFrameSize,
      widthInput,
    ],
  );

  const previewFileName = useMemo(() => {
    const baseName = fileName.trim() || safeDefaultFileName;
    const ext = getExportExtension(exportType);
    const frameSuffix = appendFrameCount ? `-${Math.max(0, estimatedFrameCount)}f` : "";
    if (exportType === "zip-png") {
      return `${baseName}${frameSuffix}.${ext}`;
    }
    return `${baseName}${frameSuffix}-spritesheet.${ext}`;
  }, [appendFrameCount, estimatedFrameCount, exportType, fileName, safeDefaultFileName]);

  const handleConfirm = useCallback(async () => {
    if (isSubmitting) return;

    let frameSize: SpriteExportFrameSize | null = null;
    if (!useOriginalFrameSize) {
      const width = Number.parseInt(widthInput, 10);
      const height = Number.parseInt(heightInput, 10);

      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        setErrorMessage("프레임 크기는 1 이상의 숫자로 입력해주세요.");
        return;
      }

      if (width > maxFrameSize || height > maxFrameSize) {
        setErrorMessage(`최대 프레임 크기는 ${maxFrameSize}x${maxFrameSize} 입니다.`);
        return;
      }

      frameSize = { width, height };
    }

    setErrorMessage("");
    setIsSubmitting(true);
    try {
      await onConfirm({
        fileName: fileName.trim() || safeDefaultFileName,
        appendFrameCount,
        frameSize,
      });
      onClose();
    } catch (error) {
      if (error instanceof Error && error.message) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("내보내기 중 오류가 발생했습니다.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    appendFrameCount,
    fileName,
    heightInput,
    isSubmitting,
    maxFrameSize,
    onClose,
    onConfirm,
    safeDefaultFileName,
    useOriginalFrameSize,
    widthInput,
  ]);

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={onClose}
        disabled={isSubmitting}
        className="px-4 py-2 bg-surface-secondary hover:bg-surface-tertiary text-text-primary rounded-lg text-sm transition-colors disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        onClick={handleConfirm}
        disabled={isSubmitting}
        className="px-4 py-2 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {isSubmitting ? "Exporting..." : "Export"}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Export ${getExportLabel(exportType)}`}
      width="480px"
      footer={footer}
      contentClassName="flex flex-col gap-4 p-4"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">File Name</label>
        <input
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          disabled={isSubmitting}
          className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent-primary"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={appendFrameCount}
          onChange={(e) => setAppendFrameCount(e.target.checked)}
          disabled={isSubmitting}
          className="accent-accent-primary"
        />
        파일명 뒤에 총 프레임수 붙이기
      </label>

      <div className="flex flex-col gap-2 rounded-lg border border-border-default p-3 bg-surface-secondary/40">
        <div className="text-sm font-medium text-text-primary">Per-frame Size</div>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={useOriginalFrameSize}
            onChange={(e) => handleUseOriginalFrameSizeChange(e.target.checked)}
            disabled={isSubmitting}
            className="accent-accent-primary"
          />
          Original {normalizedOriginalFrameSize ? `(${normalizedOriginalFrameSize.width} x ${normalizedOriginalFrameSize.height})` : ""}
        </label>
        {!useOriginalFrameSize && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={keepOriginalAspectRatio && Boolean(referenceAspectRatio)}
                onChange={(e) => handleKeepOriginalAspectRatioChange(e.target.checked)}
                disabled={isSubmitting || !referenceAspectRatio}
                className="accent-accent-primary"
              />
              원본 이미지 비율 유지 {!referenceAspectRatio ? "(원본 크기 정보 없음)" : ""}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={maxFrameSize}
                value={widthInput}
                onChange={(e) => handleWidthInputChange(e.target.value)}
                disabled={isSubmitting}
                placeholder="Width"
                className="w-28 px-2 py-1.5 rounded bg-surface-primary border border-border-default text-sm text-center focus:outline-none focus:border-accent-primary"
              />
              <span className="text-text-tertiary">x</span>
              <input
                type="number"
                min={1}
                max={maxFrameSize}
                value={heightInput}
                onChange={(e) => handleHeightInputChange(e.target.value)}
                disabled={isSubmitting}
                placeholder="Height"
                className="w-28 px-2 py-1.5 rounded bg-surface-primary border border-border-default text-sm text-center focus:outline-none focus:border-accent-primary"
              />
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-text-tertiary">
        Output: <span className="text-text-secondary">{previewFileName}</span>
      </div>

      {errorMessage && (
        <div className="text-xs text-red-400">{errorMessage}</div>
      )}
    </Modal>
  );
}
