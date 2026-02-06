"use client";

import { EditorToolMode, AspectRatio, Point, CropArea, ASPECT_RATIOS } from "../../types";
import { BrushPreset } from "../../types/brush";
import { BrushPresetSelector } from "./BrushPresetSelector";
import { Select, Scrollbar, NumberScrubber } from "../../../../shared/components";
import { LockAspectIcon, UnlockAspectIcon, SquareExpandIcon, SquareFitIcon, CanvasExpandIcon } from "@/shared/components/icons";

// ============================================
// Types
// ============================================

interface EditorToolOptionsProps {
  toolMode: EditorToolMode;
  // Brush props
  brushSize: number;
  setBrushSize: React.Dispatch<React.SetStateAction<number>>;
  brushHardness: number;
  setBrushHardness: React.Dispatch<React.SetStateAction<number>>;
  brushColor: string;
  setBrushColor: React.Dispatch<React.SetStateAction<string>>;
  stampSource: Point | null;
  // Preset props
  activePreset: BrushPreset;
  presets: BrushPreset[];
  onSelectPreset: (preset: BrushPreset) => void;
  onDeletePreset: (presetId: string) => void;
  pressureEnabled: boolean;
  onPressureToggle: (enabled: boolean) => void;
  // Crop props
  aspectRatio: AspectRatio;
  setAspectRatio: React.Dispatch<React.SetStateAction<AspectRatio>>;
  cropArea: CropArea | null;
  selectAll: () => void;
  clearCrop: () => void;
  // Extended crop props
  canvasExpandMode: boolean;
  setCanvasExpandMode: React.Dispatch<React.SetStateAction<boolean>>;
  lockAspect: boolean;
  setLockAspect: React.Dispatch<React.SetStateAction<boolean>>;
  setCropSize: (width: number, height: number) => void;
  expandToSquare: () => void;
  fitToSquare: () => void;
  onApplyCrop: () => void;
  // Tool name for default display
  currentToolName?: string;
  // Transform props
  isTransformActive?: boolean;
  transformAspectRatio?: AspectRatio;
  setTransformAspectRatio?: React.Dispatch<React.SetStateAction<AspectRatio>>;
  onApplyTransform?: () => void;
  onCancelTransform?: () => void;
  // Translations
  translations: {
    size: string;
    hardness: string;
    color: string;
    source: string;
    altClickToSetSource: string;
    presets: string;
    pressure: string;
    builtIn: string;
  };
}

// ============================================
// Component
// ============================================

export function EditorToolOptions({
  toolMode,
  brushSize,
  setBrushSize,
  brushHardness,
  setBrushHardness,
  brushColor,
  setBrushColor,
  stampSource,
  activePreset,
  presets,
  onSelectPreset,
  onDeletePreset,
  pressureEnabled,
  onPressureToggle,
  aspectRatio,
  setAspectRatio,
  cropArea,
  selectAll,
  clearCrop,
  canvasExpandMode,
  setCanvasExpandMode,
  lockAspect,
  setLockAspect,
  setCropSize,
  expandToSquare,
  fitToSquare,
  onApplyCrop,
  currentToolName,
  isTransformActive,
  transformAspectRatio,
  setTransformAspectRatio,
  onApplyTransform,
  onCancelTransform,
  translations: t,
}: EditorToolOptionsProps) {
  // Handle width/height input changes with aspect ratio lock
  const handleWidthChange = (newWidth: number) => {
    if (lockAspect && cropArea && cropArea.width > 0) {
      const ratio = cropArea.height / cropArea.width;
      setCropSize(newWidth, Math.round(newWidth * ratio));
    } else {
      setCropSize(newWidth, cropArea?.height || newWidth);
    }
  };

  const handleHeightChange = (newHeight: number) => {
    if (lockAspect && cropArea && cropArea.height > 0) {
      const ratio = cropArea.width / cropArea.height;
      setCropSize(Math.round(newHeight * ratio), newHeight);
    } else {
      setCropSize(cropArea?.width || newHeight, newHeight);
    }
  };
  return (
    <Scrollbar
      className="bg-surface-secondary border-b border-border-default shrink-0 min-h-[32px]"
      overflow={{ x: "scroll", y: "hidden" }}
    >
      <div className="flex items-center gap-2 px-3.5 py-1 whitespace-nowrap">
      {/* Brush and fill controls */}
      {(toolMode === "brush" || toolMode === "eraser" || toolMode === "stamp" || toolMode === "fill") && (
        <>
          {/* Preset selector for brush/eraser */}
          {(toolMode === "brush" || toolMode === "eraser") && (
            <BrushPresetSelector
              presets={presets}
              activePreset={activePreset}
              onSelectPreset={onSelectPreset}
              onDeletePreset={onDeletePreset}
              pressureEnabled={pressureEnabled}
              onPressureToggle={onPressureToggle}
              translations={{
                presets: t.presets,
                pressure: t.pressure,
                builtIn: t.builtIn,
              }}
            />
          )}

          {/* Size control - not for fill tool */}
          {toolMode !== "fill" && (
            <NumberScrubber
              value={brushSize}
              onChange={(v) => setBrushSize(Math.round(v))}
              min={1}
              max={200}
              step={1}
              label={`${t.size}:`}
              size="sm"
              editable
            />
          )}

          {(toolMode === "brush" || toolMode === "eraser") && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary">{t.hardness}:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={brushHardness}
                onChange={(e) => setBrushHardness(parseInt(e.target.value))}
                className="w-14 accent-accent-primary"
              />
              <span className="text-xs text-text-tertiary w-6">{brushHardness}%</span>
            </div>
          )}

          {(toolMode === "brush" || toolMode === "fill") && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary">{t.color}:</span>
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border border-border-default"
              />
              <span className="text-xs text-text-tertiary hidden md:inline">{brushColor}</span>
            </div>
          )}

          {toolMode === "stamp" && (
            <span className="text-xs text-text-secondary">
              {stampSource
                ? `${t.source}: (${Math.round(stampSource.x)}, ${Math.round(stampSource.y)})`
                : t.altClickToSetSource}
            </span>
          )}
        </>
      )}

      {/* Crop ratio and canvas resize controls */}
      {toolMode === "crop" && (
        <div className="flex items-center gap-2">
          {/* Aspect ratio selector */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">Ratio:</span>
            <Select
              value={aspectRatio}
              onChange={(value) => setAspectRatio(value as AspectRatio)}
              options={ASPECT_RATIOS.map((r) => ({ value: r.value, label: r.label }))}
              size="sm"
            />
          </div>

          {/* Width/Height input */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">W:</span>
            <input
              type="number"
              value={cropArea?.width ? Math.round(cropArea.width) : ""}
              onChange={(e) => handleWidthChange(Math.max(10, parseInt(e.target.value) || 10))}
              placeholder="---"
              className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
              min={10}
            />
            <span className="text-xs text-text-tertiary">×</span>
            <span className="text-xs text-text-secondary">H:</span>
            <input
              type="number"
              value={cropArea?.height ? Math.round(cropArea.height) : ""}
              onChange={(e) => handleHeightChange(Math.max(10, parseInt(e.target.value) || 10))}
              placeholder="---"
              className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
              min={10}
            />
            {/* Lock aspect ratio button */}
            <button
              onClick={() => setLockAspect(!lockAspect)}
              className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
                lockAspect
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover text-text-secondary"
              }`}
              title={lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
            >
              {lockAspect ? (
                <LockAspectIcon />
              ) : (
                <UnlockAspectIcon />
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-border-default" />

          {/* Square buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={expandToSquare}
              className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors flex items-center gap-0.5"
              title="Expand to square (longer side)"
            >
              <SquareExpandIcon />
              <span>Expand</span>
            </button>
            <button
              onClick={fitToSquare}
              className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors flex items-center gap-0.5"
              title="Fit to square (shorter side)"
            >
              <SquareFitIcon />
              <span>Fit</span>
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-border-default" />

          {/* Canvas expand mode toggle */}
          <button
            onClick={() => setCanvasExpandMode(!canvasExpandMode)}
            className={`px-1.5 py-0.5 text-xs rounded transition-colors flex items-center gap-0.5 ${
              canvasExpandMode
                ? "bg-accent-primary text-white"
                : "hover:bg-interactive-hover"
            }`}
            title={canvasExpandMode ? "Canvas expand mode ON" : "Canvas expand mode OFF"}
          >
            <CanvasExpandIcon />
            <span>Canvas</span>
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-border-default" />

          {/* All, Apply, Clear buttons */}
          <button
            onClick={selectAll}
            className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
          >
            All
          </button>
          {cropArea && (
            <>
              <button
                onClick={onApplyCrop}
                className="px-1.5 py-0.5 text-xs bg-accent-primary text-white hover:bg-accent-primary/90 rounded transition-colors font-medium"
                title="Apply crop/resize to canvas"
              >
                Apply
              </button>
              <button
                onClick={clearCrop}
                className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* Transform controls */}
      {toolMode === "transform" && (
        <div className="flex items-center gap-2">
          {/* Aspect ratio selector for transform */}
          {isTransformActive && setTransformAspectRatio && (
            <>
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-secondary">Ratio:</span>
                <Select
                  value={transformAspectRatio || "free"}
                  onChange={(value) => setTransformAspectRatio(value as AspectRatio)}
                  options={ASPECT_RATIOS.map((r) => ({ value: r.value, label: r.label }))}
                  size="sm"
                />
              </div>
              <div className="w-px h-4 bg-border-default" />
            </>
          )}
          <span className="text-xs text-text-secondary">
            {isTransformActive
              ? "Drag handles to resize. Shift: keep ratio, Alt: from center"
              : "Select a layer with content to transform"}
          </span>
          {isTransformActive && (
            <>
              <div className="w-px h-4 bg-border-default" />
              <button
                onClick={onApplyTransform}
                className="px-2 py-0.5 text-xs bg-accent-primary text-white hover:bg-accent-primary/90 rounded transition-colors font-medium"
              >
                Apply (Enter)
              </button>
              <button
                onClick={onCancelTransform}
                className="px-2 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
              >
                Cancel (Esc)
              </button>
            </>
          )}
        </div>
      )}

      {/* Default message when no tool-specific controls */}
      {toolMode !== "brush" && toolMode !== "eraser" && toolMode !== "stamp" && toolMode !== "crop" && toolMode !== "fill" && toolMode !== "transform" && (
        <span className="text-xs text-text-tertiary">{currentToolName}</span>
      )}
      </div>
    </Scrollbar>
  );
}
