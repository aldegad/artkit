"use client";

import { LockAspectIcon, UnlockAspectIcon } from "./icons";

export interface ExportCanvasSize {
  width: number;
  height: number;
}

interface ExportCanvasSizeControlsProps {
  sourceSize: ExportCanvasSize | null;
  useSourceSize: boolean;
  onUseSourceSizeChange: (next: boolean) => void;
  widthInput: string;
  heightInput: string;
  onWidthInputChange: (value: string) => void;
  onHeightInputChange: (value: string) => void;
  keepAspectRatio: boolean;
  onKeepAspectRatioChange: (next: boolean) => void;
  disabled?: boolean;
  labels: {
    canvasSize: string;
    useSourceSize: string;
    width: string;
    height: string;
    keepAspectRatio: string;
    sizeLimitHint: string;
  };
}

export function ExportCanvasSizeControls({
  sourceSize,
  useSourceSize,
  onUseSourceSizeChange,
  widthInput,
  heightInput,
  onWidthInputChange,
  onHeightInputChange,
  keepAspectRatio,
  onKeepAspectRatioChange,
  disabled = false,
  labels,
}: ExportCanvasSizeControlsProps) {
  const sourceLabel = sourceSize ? ` (${sourceSize.width}x${sourceSize.height})` : "";

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-text-secondary">{labels.canvasSize}</label>

      <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={useSourceSize}
          onChange={(e) => onUseSourceSizeChange(e.target.checked)}
          disabled={disabled || !sourceSize}
          className="accent-accent-primary"
        />
        <span>
          {labels.useSourceSize}
          {sourceLabel}
        </span>
      </label>

      <div className="flex items-center gap-1">
        <span className="text-xs text-text-secondary">{labels.width}:</span>
        <input
          type="number"
          min={1}
          value={widthInput}
          onChange={(e) => onWidthInputChange(e.target.value)}
          disabled={disabled || useSourceSize}
          className="w-16 px-1 py-0.5 bg-surface-secondary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary disabled:opacity-50"
        />
        <span className="text-xs text-text-tertiary">x</span>
        <span className="text-xs text-text-secondary">{labels.height}:</span>
        <input
          type="number"
          min={1}
          value={heightInput}
          onChange={(e) => onHeightInputChange(e.target.value)}
          disabled={disabled || useSourceSize}
          className="w-16 px-1 py-0.5 bg-surface-secondary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => onKeepAspectRatioChange(!keepAspectRatio)}
          disabled={disabled || useSourceSize}
          className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
            keepAspectRatio
              ? "bg-accent-primary text-white"
              : "hover:bg-interactive-hover text-text-secondary"
          } disabled:opacity-50`}
          title={labels.keepAspectRatio}
        >
          {keepAspectRatio ? <LockAspectIcon /> : <UnlockAspectIcon />}
        </button>
      </div>

      <p className="text-[11px] text-text-tertiary">{labels.sizeLimitHint}</p>
    </div>
  );
}
