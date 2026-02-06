"use client";

import { useMask } from "../../contexts/MaskContext";
import { useMaskTool } from "../../hooks/useMaskTool";
import { cn } from "@/shared/utils/cn";
import { MASK_BRUSH } from "../../constants";
import Tooltip from "@/shared/components/Tooltip";
import {
  BrushIcon,
  EraserIcon,
  FillBucketIcon,
  DeleteIcon,
} from "@/shared/components/icons";

interface MaskControlsProps {
  className?: string;
}

export function MaskControls({ className }: MaskControlsProps) {
  const {
    brushSettings,
    setBrushSize,
    setBrushHardness,
    setBrushMode,
    isEditingMask,
  } = useMask();

  const { clearMask, fillMask } = useMaskTool();

  if (!isEditingMask) {
    return null;
  }

  const modeBtn = (active: boolean) =>
    cn(
      "p-1.5 rounded transition-colors",
      active
        ? "bg-accent-primary text-white"
        : "hover:bg-interactive-hover text-text-secondary hover:text-text-primary"
    );

  const actionBtn =
    "p-1.5 rounded transition-colors hover:bg-interactive-hover text-text-secondary hover:text-text-primary";

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1 bg-surface-secondary border border-border-default rounded-lg shadow-lg",
        className
      )}
    >
      {/* Paint / Erase mode toggle */}
      <Tooltip content="Paint mask" shortcut="B">
        <button
          onClick={() => setBrushMode("paint")}
          className={modeBtn(brushSettings.mode === "paint")}
        >
          <BrushIcon className="w-3.5 h-3.5" />
        </button>
      </Tooltip>
      <Tooltip content="Erase mask" shortcut="E">
        <button
          onClick={() => setBrushMode("erase")}
          className={modeBtn(brushSettings.mode === "erase")}
        >
          <EraserIcon className="w-3.5 h-3.5" />
        </button>
      </Tooltip>

      <div className="w-px h-5 bg-border-default mx-1" />

      {/* Size slider */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-text-tertiary w-5 text-right">
          {brushSettings.size}
        </span>
        <input
          type="range"
          min={MASK_BRUSH.MIN_SIZE}
          max={MASK_BRUSH.MAX_SIZE}
          value={brushSettings.size}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-16 h-1 bg-surface-tertiary rounded-full appearance-none cursor-pointer accent-accent-primary"
          title="Brush size"
        />
      </div>

      {/* Hardness slider */}
      <div className="flex items-center gap-1.5 ml-1">
        <span className="text-[10px] text-text-tertiary w-6 text-right">
          {brushSettings.hardness}%
        </span>
        <input
          type="range"
          min={MASK_BRUSH.MIN_HARDNESS}
          max={MASK_BRUSH.MAX_HARDNESS}
          value={brushSettings.hardness}
          onChange={(e) => setBrushHardness(Number(e.target.value))}
          className="w-16 h-1 bg-surface-tertiary rounded-full appearance-none cursor-pointer accent-accent-primary"
          title="Brush hardness"
        />
      </div>

      <div className="w-px h-5 bg-border-default mx-1" />

      {/* Fill / Clear */}
      <Tooltip content="Fill mask">
        <button onClick={fillMask} className={actionBtn}>
          <FillBucketIcon className="w-3.5 h-3.5" />
        </button>
      </Tooltip>
      <Tooltip content="Clear mask">
        <button onClick={clearMask} className={actionBtn}>
          <DeleteIcon className="w-3.5 h-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}
