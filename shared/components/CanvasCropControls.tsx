"use client";

import { Select } from "./Select";
import {
  LockAspectIcon,
  UnlockAspectIcon,
  SquareExpandIcon,
  SquareFitIcon,
  CanvasExpandIcon,
} from "./icons";
import { ASPECT_RATIOS, type AspectRatio } from "@/shared/types/aspectRatio";

export interface CanvasCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasCropControlsLabels {
  ratio: string;
  width: string;
  height: string;
  expand: string;
  fit: string;
  canvas: string;
  all: string;
  apply: string;
  clear: string;
  lockAspect: string;
  unlockAspect: string;
  expandToSquare: string;
  fitToSquare: string;
  canvasExpandOn: string;
  canvasExpandOff: string;
  applyCrop: string;
}

const DEFAULT_LABELS: CanvasCropControlsLabels = {
  ratio: "Ratio:",
  width: "W:",
  height: "H:",
  expand: "Expand",
  fit: "Fit",
  canvas: "Canvas",
  all: "All",
  apply: "Apply",
  clear: "Clear",
  lockAspect: "Lock aspect ratio",
  unlockAspect: "Unlock aspect ratio",
  expandToSquare: "Expand to square (longer side)",
  fitToSquare: "Fit to square (shorter side)",
  canvasExpandOn: "Canvas expand mode ON",
  canvasExpandOff: "Canvas expand mode OFF",
  applyCrop: "Apply crop/resize to canvas",
};

interface CanvasCropControlsProps {
  cropAspectRatio: AspectRatio;
  onCropAspectRatioChange: (ratio: AspectRatio) => void;
  cropArea: CanvasCropArea | null;
  onCropWidthChange: (width: number) => void;
  onCropHeightChange: (height: number) => void;
  lockCropAspect: boolean;
  onToggleLockCropAspect: () => void;
  onExpandToSquare: () => void;
  onFitToSquare: () => void;
  canvasExpandMode: boolean;
  onToggleCanvasExpandMode: () => void;
  onSelectAllCrop: () => void;
  onApplyCrop: () => void;
  onClearCrop: () => void;
  minCropSize?: number;
  labels?: Partial<CanvasCropControlsLabels>;
}

export function CanvasCropControls({
  cropAspectRatio,
  onCropAspectRatioChange,
  cropArea,
  onCropWidthChange,
  onCropHeightChange,
  lockCropAspect,
  onToggleLockCropAspect,
  onExpandToSquare,
  onFitToSquare,
  canvasExpandMode,
  onToggleCanvasExpandMode,
  onSelectAllCrop,
  onApplyCrop,
  onClearCrop,
  minCropSize = 10,
  labels,
}: CanvasCropControlsProps) {
  const t = { ...DEFAULT_LABELS, ...labels };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="text-xs text-text-secondary">{t.ratio}</span>
        <Select
          value={cropAspectRatio}
          onChange={(value) => onCropAspectRatioChange(value as AspectRatio)}
          options={ASPECT_RATIOS.map((r) => ({ value: r.value, label: r.label }))}
          size="sm"
        />
      </div>

      <div className="flex items-center gap-1">
        <span className="text-xs text-text-secondary">{t.width}</span>
        <input
          type="number"
          value={cropArea?.width ? Math.round(cropArea.width) : ""}
          onChange={(e) => onCropWidthChange(Math.max(minCropSize, parseInt(e.target.value, 10) || minCropSize))}
          placeholder="---"
          className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
          min={minCropSize}
        />
        <span className="text-xs text-text-tertiary">x</span>
        <span className="text-xs text-text-secondary">{t.height}</span>
        <input
          type="number"
          value={cropArea?.height ? Math.round(cropArea.height) : ""}
          onChange={(e) => onCropHeightChange(Math.max(minCropSize, parseInt(e.target.value, 10) || minCropSize))}
          placeholder="---"
          className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
          min={minCropSize}
        />
        <button
          onClick={onToggleLockCropAspect}
          className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
            lockCropAspect
              ? "bg-accent-primary text-white"
              : "hover:bg-interactive-hover text-text-secondary"
          }`}
          title={lockCropAspect ? t.unlockAspect : t.lockAspect}
        >
          {lockCropAspect ? <LockAspectIcon /> : <UnlockAspectIcon />}
        </button>
      </div>

      <div className="w-px h-4 bg-border-default" />

      <div className="flex items-center gap-1">
        <button
          onClick={onExpandToSquare}
          className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors flex items-center gap-0.5"
          title={t.expandToSquare}
        >
          <SquareExpandIcon />
          <span>{t.expand}</span>
        </button>
        <button
          onClick={onFitToSquare}
          className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors flex items-center gap-0.5"
          title={t.fitToSquare}
        >
          <SquareFitIcon />
          <span>{t.fit}</span>
        </button>
      </div>

      <div className="w-px h-4 bg-border-default" />

      <button
        onClick={onToggleCanvasExpandMode}
        className={`px-1.5 py-0.5 text-xs rounded transition-colors flex items-center gap-0.5 ${
          canvasExpandMode
            ? "bg-accent-primary text-white"
            : "hover:bg-interactive-hover"
        }`}
        title={canvasExpandMode ? t.canvasExpandOn : t.canvasExpandOff}
      >
        <CanvasExpandIcon />
        <span>{t.canvas}</span>
      </button>

      <div className="w-px h-4 bg-border-default" />

      <button
        onClick={onSelectAllCrop}
        className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
      >
        {t.all}
      </button>
      {cropArea && (
        <>
          <button
            onClick={onApplyCrop}
            className="px-1.5 py-0.5 text-xs bg-accent-primary text-white hover:bg-accent-primary/90 rounded transition-colors font-medium"
            title={t.applyCrop}
          >
            {t.apply}
          </button>
          <button
            onClick={onClearCrop}
            className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
          >
            {t.clear}
          </button>
        </>
      )}
    </div>
  );
}
