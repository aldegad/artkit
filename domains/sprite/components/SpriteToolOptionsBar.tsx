"use client";

import { Scrollbar, NumberScrubber, CanvasCropControls } from "@/shared/components";
import { BrushPresetSelector } from "@/domains/image/components/toolbars/BrushPresetSelector";
import type { BrushPreset } from "@/domains/image/types/brush";
import type { AspectRatio } from "@/shared/types/aspectRatio";
import type { SpriteToolMode, SpriteFrame, SpriteCropArea } from "../types";

interface SpriteToolOptionsBarProps {
  toolMode: SpriteToolMode;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  brushHardness: number;
  setBrushHardness: (hardness: number) => void;
  activePreset: BrushPreset;
  setActivePreset: (preset: BrushPreset) => void;
  presets: BrushPreset[];
  pressureEnabled: boolean;
  setPressureEnabled: (enabled: boolean) => void;
  cropAspectRatio: AspectRatio;
  setCropAspectRatio: (ratio: AspectRatio) => void;
  cropArea: SpriteCropArea | null;
  lockCropAspect: boolean;
  setLockCropAspect: (locked: boolean) => void;
  canvasExpandMode: boolean;
  setCanvasExpandMode: (enabled: boolean) => void;
  onSelectAllCrop: () => void;
  onClearCrop: () => void;
  onCropWidthChange: (width: number) => void;
  onCropHeightChange: (height: number) => void;
  onExpandToSquare: () => void;
  onFitToSquare: () => void;
  onApplyCrop: () => void;
  selectedFrameId: number | null;
  selectedPointIndex: number | null;
  frames: SpriteFrame[];
  labels: {
    size: string;
    hardness: string;
    colorPickerTip: string;
    brush: string;
    eraser: string;
    eyedropper: string;
    zoomInOut: string;
    frame: string;
    selected: string;
    point: string;
    presets: string;
    pressure: string;
    builtIn: string;
    zoomToolTip: string;
    cropToolTip: string;
  };
}

export default function SpriteToolOptionsBar({
  toolMode,
  brushColor,
  setBrushColor,
  brushSize,
  setBrushSize,
  brushHardness,
  setBrushHardness,
  activePreset,
  setActivePreset,
  presets,
  pressureEnabled,
  setPressureEnabled,
  cropAspectRatio,
  setCropAspectRatio,
  cropArea,
  lockCropAspect,
  setLockCropAspect,
  canvasExpandMode,
  setCanvasExpandMode,
  onSelectAllCrop,
  onClearCrop,
  onCropWidthChange,
  onCropHeightChange,
  onExpandToSquare,
  onFitToSquare,
  onApplyCrop,
  selectedFrameId,
  selectedPointIndex,
  frames,
  labels,
}: SpriteToolOptionsBarProps) {
  const isBrushTool = toolMode === "brush" || toolMode === "eraser";
  const isCropTool = toolMode === "crop";
  const isZoomTool = toolMode === "zoom";
  const nonBrushToolLabel = isZoomTool ? labels.zoomInOut : toolMode === "eyedropper" ? labels.eyedropper : null;
  const nonBrushToolDescription = isZoomTool ? labels.zoomToolTip : toolMode === "eyedropper" ? labels.colorPickerTip : isCropTool ? labels.cropToolTip : null;

  const selectedFrameIndex = selectedFrameId !== null ? frames.findIndex((f) => f.id === selectedFrameId) : -1;

  return (
    <Scrollbar
      className="bg-surface-secondary border-b border-border-default shrink-0 min-h-[32px]"
      overflow={{ x: "scroll", y: "hidden" }}
    >
      <div className="flex items-center gap-2 px-3.5 py-1 whitespace-nowrap">
        {(toolMode === "select" || toolMode === "pen") && selectedFrameIndex >= 0 && (
          <>
            <span className="text-xs text-accent-primary">
              {labels.frame} {selectedFrameIndex + 1} {labels.selected}
              {selectedPointIndex !== null && ` (${labels.point} ${selectedPointIndex + 1})`}
            </span>
            <div className="w-px h-4 bg-border-default" />
          </>
        )}

        {!isBrushTool && nonBrushToolLabel && (
          <span className="text-xs text-text-secondary min-w-[72px]">
            {nonBrushToolLabel}
          </span>
        )}

        {isBrushTool ? (
          <>
            <BrushPresetSelector
              presets={presets}
              activePreset={activePreset}
              onSelectPreset={setActivePreset}
              pressureEnabled={pressureEnabled}
              onPressureToggle={setPressureEnabled}
              translations={{
                presets: labels.presets,
                pressure: labels.pressure,
                builtIn: labels.builtIn,
              }}
            />

            {toolMode === "brush" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={brushColor}
                  onChange={(e) => setBrushColor(e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer border border-border-default"
                  style={{ backgroundColor: brushColor }}
                  title={labels.colorPickerTip}
                />
                <span className="text-[10px] text-text-tertiary font-mono">{brushColor}</span>
              </div>
            )}

            <NumberScrubber
              value={brushHardness}
              onChange={(value) => setBrushHardness(Math.round(value))}
              min={0}
              max={100}
              step={1}
              label={`${labels.hardness}:`}
              format={(value) => `${Math.round(value)}%`}
              size="sm"
            />

            <NumberScrubber
              value={brushSize}
              onChange={(value) => setBrushSize(Math.round(value))}
              min={1}
              max={200}
              step={1}
              label={`${labels.size}:`}
              size="sm"
              editable
            />
          </>
        ) : isCropTool ? (
          <CanvasCropControls
            cropAspectRatio={cropAspectRatio}
            onCropAspectRatioChange={setCropAspectRatio}
            cropArea={cropArea}
            onCropWidthChange={onCropWidthChange}
            onCropHeightChange={onCropHeightChange}
            lockCropAspect={lockCropAspect}
            onToggleLockCropAspect={() => setLockCropAspect(!lockCropAspect)}
            onExpandToSquare={onExpandToSquare}
            onFitToSquare={onFitToSquare}
            canvasExpandMode={canvasExpandMode}
            onToggleCanvasExpandMode={() => setCanvasExpandMode(!canvasExpandMode)}
            onSelectAllCrop={onSelectAllCrop}
            onApplyCrop={onApplyCrop}
            onClearCrop={onClearCrop}
          />
        ) : nonBrushToolDescription ? (
          <span className="text-xs text-text-tertiary">{nonBrushToolDescription}</span>
        ) : null}

        <div className="flex-1 min-w-0" />
      </div>
    </Scrollbar>
  );
}
