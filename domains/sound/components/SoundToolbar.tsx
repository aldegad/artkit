"use client";

import { useSoundEditor } from "../contexts/SoundEditorContext";
import { useLanguage } from "@/shared/contexts/LanguageContext";
import { SoundToolMode } from "../types";
import { cn } from "@/shared/utils/cn";
import { CursorIcon, RazorToolIcon, ZoomSearchIcon, CloseIcon } from "@/shared/components/icons";
import { NumberScrubber } from "@/shared/components";

interface ToolButtonProps {
  mode: SoundToolMode;
  currentMode: SoundToolMode;
  onClick: (mode: SoundToolMode) => void;
  icon: React.ReactNode;
  label: string;
  tooltip?: string;
}

function ToolButton({ mode, currentMode, onClick, icon, label, tooltip }: ToolButtonProps) {
  const isActive = mode === currentMode;

  return (
    <button
      onClick={() => onClick(mode)}
      className={cn(
        "flex flex-col items-center gap-1 p-2 rounded transition-colors",
        isActive
          ? "bg-blue-600 text-white"
          : "bg-gray-700 hover:bg-gray-600 text-gray-300"
      )}
      title={tooltip || label}
    >
      <div className="w-6 h-6 flex items-center justify-center">{icon}</div>
      <span className="text-xs">{label}</span>
    </button>
  );
}

export function SoundToolbar() {
  const { t } = useLanguage();
  const { toolMode, setToolMode, audioBuffer, zoom, setZoom, clearAudio } = useSoundEditor();

  if (!audioBuffer) return null;

  return (
    <div className="flex items-center gap-4 p-2 bg-gray-800 rounded-lg">
      {/* Tool Buttons */}
      <div className="flex gap-1">
        <ToolButton
          mode="select"
          currentMode={toolMode}
          onClick={setToolMode}
          icon={<CursorIcon className="w-5 h-5" />}
          label={t.select}
          tooltip="Select / Seek"
        />
        <ToolButton
          mode="trim"
          currentMode={toolMode}
          onClick={setToolMode}
          icon={<RazorToolIcon className="w-5 h-5" />}
          label={t.crop}
          tooltip="Trim audio region"
        />
        <ToolButton
          mode="zoom"
          currentMode={toolMode}
          onClick={setToolMode}
          icon={<ZoomSearchIcon className="w-5 h-5" />}
          label={t.zoom}
          tooltip="Zoom waveform"
        />
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-2 px-3 border-l border-gray-700">
        <NumberScrubber
          value={zoom}
          onChange={setZoom}
          min={1}
          max={100}
          step={{ multiply: 1.5 }}
          format={(v) => `${Math.round(v * 100)}%`}
          size="sm"
        />
        <button
          onClick={() => setZoom(1)}
          className="p-1 rounded hover:bg-gray-700 text-xs text-gray-400"
          title={t.fitToScreen}
        >
          Fit
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Close/Clear Button */}
      <button
        onClick={clearAudio}
        className="p-2 rounded hover:bg-red-600/20 text-red-500 hover:text-red-400 transition-colors"
        title={t.close}
      >
        <CloseIcon className="w-5 h-5" />
      </button>
    </div>
  );
}
