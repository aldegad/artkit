"use client";

import { useState } from "react";
import { BrushPreset, BrushPresetType } from "../../types/brush";
import { Popover, Scrollbar } from "../../../../shared/components";
import { PencilPresetIcon, AirbrushPresetIcon, MarkerPresetIcon, WatercolorPresetIcon, DefaultBrushPresetIcon, ChevronDownIcon, CloseIcon } from "@/shared/components/icons";

interface BrushPresetSelectorProps {
  presets: BrushPreset[];
  activePreset: BrushPreset;
  onSelectPreset: (preset: BrushPreset) => void;
  onDeletePreset?: (presetId: string) => void;
  pressureEnabled: boolean;
  onPressureToggle: (enabled: boolean) => void;
  translations: {
    presets: string;
    pressure: string;
    builtIn: string;
  };
}

// Icon components for preset types
function PresetIcon({ type }: { type: BrushPresetType }) {
  switch (type) {
    case "pencil":
      return <PencilPresetIcon />;
    case "airbrush":
      return <AirbrushPresetIcon />;
    case "marker":
      return <MarkerPresetIcon />;
    case "watercolor":
      return <WatercolorPresetIcon />;
    default:
      return <DefaultBrushPresetIcon />;
  }
}

export function BrushPresetSelector({
  presets,
  activePreset,
  onSelectPreset,
  onDeletePreset,
  pressureEnabled,
  onPressureToggle,
  translations: t,
}: BrushPresetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      className="flex items-center gap-1.5 px-2 py-1 bg-surface-primary border border-border-default rounded hover:bg-surface-tertiary transition-colors"
    >
      <PresetIcon type={activePreset.type} />
      <span className="text-xs hidden sm:inline">{activePreset.name}</span>
      <ChevronDownIcon className={`w-3 h-3 text-text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`} />
    </button>
  );

  return (
    <Popover
      trigger={trigger}
      open={isOpen}
      onOpenChange={setIsOpen}
      align="start"
      side="bottom"
      sideOffset={4}
      className="w-48"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-default">
        <span className="text-xs font-medium text-text-secondary">{t.presets}</span>
      </div>

      {/* Preset list */}
      <Scrollbar className="max-h-60" overflow={{ x: "hidden", y: "scroll" }}>
        <div className="py-1">
          {presets.map((preset) => (
          <button
            type="button"
            key={preset.id}
            onClick={() => {
              onSelectPreset(preset);
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-interactive-hover transition-colors ${
              activePreset.id === preset.id ? "bg-accent-primary/10" : ""
            }`}
          >
            <PresetIcon type={preset.type} />
            <span className="flex-1 text-left text-xs">{preset.name}</span>
            {preset.isBuiltIn && (
              <span className="text-[10px] text-text-quaternary">{t.builtIn}</span>
            )}
            {!preset.isBuiltIn && onDeletePreset && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeletePreset(preset.id);
                }}
                className="p-0.5 hover:text-red-500 transition-colors"
              >
                <CloseIcon className="w-3 h-3" />
              </button>
            )}
          </button>
          ))}
        </div>
      </Scrollbar>

      {/* Pressure toggle */}
      <div className="px-3 py-2 border-t border-border-default">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={pressureEnabled}
            onChange={(e) => onPressureToggle(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-accent-primary"
          />
          <span className="text-xs text-text-secondary">{t.pressure}</span>
        </label>
      </div>
    </Popover>
  );
}
