"use client";

import { useMask } from "../../contexts/MaskContext";
import { useMaskTool } from "../../hooks/useMaskTool";
import { cn } from "@/shared/utils/cn";
import { MASK_BRUSH } from "../../constants";
import Tooltip from "@/shared/components/Tooltip";
import { NumberScrubber } from "@/shared/components";
import { useLanguage } from "@/shared/contexts";
import { BrushPresetSelector } from "@/domains/image/components/toolbars/BrushPresetSelector";
import {
  BrushIcon,
  EraserIcon,
  FillBucketIcon,
  DeleteIcon,
} from "@/shared/components/icons";

interface MaskControlsProps {
  className?: string;
  variant?: "floating" | "toolbar";
}

function formatMaskTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  return `${mins}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
}

export function MaskControls({ className, variant = "floating" }: MaskControlsProps) {
  const {
    activeMaskId,
    brushSettings,
    setBrushSize,
    setBrushHardness,
    setBrushMode,
    activePreset,
    setActivePreset,
    presets,
    pressureEnabled,
    setPressureEnabled,
    isEditingMask,
    masks,
    saveMaskData,
    saveMaskHistoryPoint,
  } = useMask();

  const { clearMask, fillMask } = useMaskTool();
  const { t } = useLanguage();

  const activeMask = activeMaskId ? masks.get(activeMaskId) : null;

  // Nothing selected
  if (!activeMask) return null;

  const hasPaintData = !!activeMask.maskData;
  const timeRange = `${formatMaskTime(activeMask.startTime)} - ${formatMaskTime(activeMask.startTime + activeMask.duration)}`;

  const modeBtn = (active: boolean) =>
    cn(
      "p-1.5 rounded transition-colors",
      active
        ? "bg-accent-primary text-white"
        : "hover:bg-interactive-hover text-text-secondary hover:text-text-primary"
    );

  const actionBtn =
    "p-1.5 rounded transition-colors hover:bg-interactive-hover text-text-secondary hover:text-text-primary";

  const containerClass =
    variant === "toolbar"
      ? "flex items-center gap-1 px-3.5 py-1 whitespace-nowrap"
      : "flex items-center gap-1 px-2 py-1 bg-surface-secondary border border-border-default rounded-lg shadow-lg";

  return (
    <div
      className={cn(
        containerClass,
        className
      )}
    >
      {/* Mask info */}
      <div className="flex items-center gap-1.5 mr-1">
        <span className={cn(
          "inline-block w-1.5 h-1.5 rounded-full",
          isEditingMask ? "bg-red-400 animate-pulse" : hasPaintData ? "bg-purple-400" : "bg-text-tertiary"
        )} />
        <span className="text-[10px] text-text-secondary font-mono">
          {timeRange}
        </span>
      </div>

      {isEditingMask ? (
        <>
          <div className="w-px h-5 bg-border-default mx-1" />

          {/* Paint / Erase mode toggle */}
          <Tooltip content={t.paintMask} shortcut="B">
            <button
              onClick={() => setBrushMode("paint")}
              className={modeBtn(brushSettings.mode === "paint")}
            >
              <BrushIcon className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
          <Tooltip content={t.eraseMask} shortcut="E">
            <button
              onClick={() => setBrushMode("erase")}
              className={modeBtn(brushSettings.mode === "erase")}
            >
              <EraserIcon className="w-3.5 h-3.5" />
            </button>
          </Tooltip>

          <div className="w-px h-5 bg-border-default mx-1" />

          <BrushPresetSelector
            presets={presets}
            activePreset={activePreset}
            onSelectPreset={setActivePreset}
            pressureEnabled={pressureEnabled}
            onPressureToggle={setPressureEnabled}
            translations={{
              presets: t.presets,
              pressure: t.pressure,
              builtIn: t.builtIn,
            }}
          />

          <div className="w-px h-5 bg-border-default mx-1" />

          {/* Size */}
          <NumberScrubber
            value={brushSettings.size}
            onChange={setBrushSize}
            min={MASK_BRUSH.MIN_SIZE}
            max={MASK_BRUSH.MAX_SIZE}
            step={1}
            size="sm"
          />

          {/* Hardness */}
          <NumberScrubber
            value={brushSettings.hardness}
            onChange={setBrushHardness}
            min={MASK_BRUSH.MIN_HARDNESS}
            max={MASK_BRUSH.MAX_HARDNESS}
            step={1}
            format={(v) => `${Math.round(v)}%`}
            size="sm"
          />

          <div className="w-px h-5 bg-border-default mx-1" />

          {/* Fill / Clear */}
          <Tooltip content={t.fillMask}>
            <button
              onClick={() => {
                saveMaskHistoryPoint();
                fillMask();
                saveMaskData();
              }}
              className={actionBtn}
            >
              <FillBucketIcon className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
          <Tooltip content={t.clearMask}>
            <button
              onClick={() => {
                saveMaskHistoryPoint();
                clearMask();
                saveMaskData();
              }}
              className={actionBtn}
            >
              <DeleteIcon className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </>
      ) : (
        <span className="text-[10px] text-text-tertiary ml-1">
          {t.longPressToEdit}
        </span>
      )}
    </div>
  );
}
