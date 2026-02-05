"use client";

import { useState } from "react";
import { BrushPreset, BrushPresetType } from "../../types/brush";
import { Popover, Scrollbar } from "../../../../shared/components";

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
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      );
    case "airbrush":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" strokeWidth={1.5} opacity={0.5} />
          <circle cx="12" cy="12" r="6" strokeWidth={1.5} opacity={0.7} />
          <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
        </svg>
      );
    case "marker":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="8" y="4" width="8" height="16" rx="1" strokeWidth={2} />
          <line x1="8" y1="8" x2="16" y2="8" strokeWidth={2} />
        </svg>
      );
    case "watercolor":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3c-2 4-4 6-4 9a4 4 0 108 0c0-3-2-5-4-9z"
          />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" strokeWidth={2} />
        </svg>
      );
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
      <svg
        className={`w-3 h-3 text-text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
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
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
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
