"use client";

import { EditorToolMode, AspectRatio, Point, CropArea, ASPECT_RATIOS } from "../../types";
import { BrushPreset } from "../../types/brush";
import { BrushPresetSelector } from "./BrushPresetSelector";
import { Select } from "../../../../shared/components";

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
  // Tool name for default display
  currentToolName?: string;
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
  currentToolName,
  translations: t,
}: EditorToolOptionsProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-1 bg-surface-secondary border-b border-border-default shrink-0 overflow-x-auto min-h-[32px]">
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
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary">{t.size}:</span>
              <button
                onClick={() => setBrushSize((s) => Math.max(1, s - 1))}
                className="w-5 h-5 flex items-center justify-center hover:bg-interactive-hover rounded text-xs"
              >
                -
              </button>
              <input
                type="number"
                value={brushSize}
                onChange={(e) =>
                  setBrushSize(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))
                }
                className="w-10 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
                min={1}
                max={200}
              />
              <button
                onClick={() => setBrushSize((s) => Math.min(200, s + 1))}
                className="w-5 h-5 flex items-center justify-center hover:bg-interactive-hover rounded text-xs"
              >
                +
              </button>
            </div>
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

      {/* Crop ratio */}
      {toolMode === "crop" && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-text-secondary">Ratio:</span>
          <Select
            value={aspectRatio}
            onChange={(value) => setAspectRatio(value as AspectRatio)}
            options={ASPECT_RATIOS.map((r) => ({ value: r.value, label: r.label }))}
            size="sm"
          />
          <button
            onClick={selectAll}
            className="px-1 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
          >
            All
          </button>
          {cropArea && (
            <button
              onClick={clearCrop}
              className="px-1 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Default message when no tool-specific controls */}
      {toolMode !== "brush" && toolMode !== "eraser" && toolMode !== "stamp" && toolMode !== "crop" && toolMode !== "fill" && (
        <span className="text-xs text-text-tertiary">{currentToolName}</span>
      )}
    </div>
  );
}
