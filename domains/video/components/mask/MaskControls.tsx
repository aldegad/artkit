"use client";

import { useMask } from "../../contexts/MaskContext";
import { useMaskTool } from "../../hooks/useMaskTool";
import { cn } from "@/shared/utils/cn";
import { MASK_BRUSH } from "../../constants";

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
    endMaskEdit,
    addKeyframe,
    activeMaskId,
  } = useMask();

  const { getMaskDataUrl, clearMask, fillMask } = useMaskTool();

  const handleSaveKeyframe = () => {
    if (!activeMaskId) return;
    const dataUrl = getMaskDataUrl();
    if (dataUrl) {
      // Save at current time (you'd need to get current time from VideoState)
      addKeyframe(activeMaskId, 0, dataUrl);
    }
  };

  if (!isEditingMask) {
    return null;
  }

  return (
    <div
      className={cn(
        "p-3 bg-surface-secondary border border-border rounded-lg",
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Mask Brush</h3>
        <button
          onClick={endMaskEdit}
          className="text-xs text-text-secondary hover:text-text-primary"
        >
          Done
        </button>
      </div>

      {/* Brush Mode */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setBrushMode("paint")}
          className={cn(
            "flex-1 py-1.5 text-xs rounded transition-colors",
            brushSettings.mode === "paint"
              ? "bg-accent text-white"
              : "bg-surface-tertiary hover:bg-surface-tertiary/80"
          )}
        >
          Paint
        </button>
        <button
          onClick={() => setBrushMode("erase")}
          className={cn(
            "flex-1 py-1.5 text-xs rounded transition-colors",
            brushSettings.mode === "erase"
              ? "bg-accent text-white"
              : "bg-surface-tertiary hover:bg-surface-tertiary/80"
          )}
        >
          Erase
        </button>
      </div>

      {/* Brush Size */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-text-secondary mb-1">
          <span>Size</span>
          <span>{brushSettings.size}px</span>
        </div>
        <input
          type="range"
          min={MASK_BRUSH.MIN_SIZE}
          max={MASK_BRUSH.MAX_SIZE}
          value={brushSettings.size}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-full h-1.5 bg-surface-tertiary rounded-full appearance-none cursor-pointer"
        />
      </div>

      {/* Brush Hardness */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-text-secondary mb-1">
          <span>Hardness</span>
          <span>{brushSettings.hardness}%</span>
        </div>
        <input
          type="range"
          min={MASK_BRUSH.MIN_HARDNESS}
          max={MASK_BRUSH.MAX_HARDNESS}
          value={brushSettings.hardness}
          onChange={(e) => setBrushHardness(Number(e.target.value))}
          className="w-full h-1.5 bg-surface-tertiary rounded-full appearance-none cursor-pointer"
        />
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <button
          onClick={fillMask}
          className="flex-1 py-1.5 text-xs bg-surface-tertiary hover:bg-surface-tertiary/80 rounded transition-colors"
        >
          Fill
        </button>
        <button
          onClick={clearMask}
          className="flex-1 py-1.5 text-xs bg-surface-tertiary hover:bg-surface-tertiary/80 rounded transition-colors"
        >
          Clear
        </button>
        <button
          onClick={handleSaveKeyframe}
          className="flex-1 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
