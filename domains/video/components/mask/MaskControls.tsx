"use client";

import { useMask } from "../../contexts/MaskContext";
import { useVideoState } from "../../contexts";
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
    masks,
  } = useMask();

  const { getMaskDataUrl, clearMask, fillMask } = useMaskTool();
  const { playback } = useVideoState();

  const handleSaveKeyframe = () => {
    if (!activeMaskId) return;
    const mask = masks.get(activeMaskId);
    if (!mask) return;
    const dataUrl = getMaskDataUrl();
    if (dataUrl) {
      // Convert absolute time to mask-local time
      const localTime = playback.currentTime - mask.startTime;
      addKeyframe(activeMaskId, localTime, dataUrl);
    }
  };

  if (!isEditingMask) {
    return null;
  }

  return (
    <div
      className={cn(
        "p-3 bg-surface-secondary border border-border-default rounded-lg",
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Mask Brush</h3>
        <button
          onClick={endMaskEdit}
          className="text-xs text-text-secondary hover:text-text-primary"
          title="Finish mask editing"
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
          title="Paint to reveal mask area (white = visible)"
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
          title="Erase mask area (black = transparent)"
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
      <div className="flex gap-2 pt-2 border-t border-border-default">
        <button
          onClick={fillMask}
          className="flex-1 py-1.5 text-xs bg-surface-tertiary hover:bg-surface-tertiary/80 rounded transition-colors"
          title="Fill entire mask (make all visible)"
        >
          Fill
        </button>
        <button
          onClick={clearMask}
          className="flex-1 py-1.5 text-xs bg-surface-tertiary hover:bg-surface-tertiary/80 rounded transition-colors"
          title="Clear entire mask (make all transparent)"
        >
          Clear
        </button>
        <button
          onClick={handleSaveKeyframe}
          className="flex-1 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors"
          title="Save current mask as keyframe"
        >
          Save
        </button>
      </div>
    </div>
  );
}
