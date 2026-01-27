"use client";

import { useSoundEditor } from "../contexts/SoundEditorContext";
import { useLanguage } from "@/shared/contexts/LanguageContext";
import { SoundToolMode } from "../types";
import { cn } from "@/shared/utils/cn";

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
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
          }
          label={t.select}
          tooltip="Select / Seek"
        />
        <ToolButton
          mode="trim"
          currentMode={toolMode}
          onClick={setToolMode}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
            </svg>
          }
          label={t.crop}
          tooltip="Trim audio region"
        />
        <ToolButton
          mode="zoom"
          currentMode={toolMode}
          onClick={setToolMode}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          }
          label={t.zoom}
          tooltip="Zoom waveform"
        />
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-2 px-3 border-l border-gray-700">
        <button
          onClick={() => setZoom(zoom / 1.5)}
          disabled={zoom <= 1}
          className="p-1 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title={t.zoomOut}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span className="text-xs text-gray-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(zoom * 1.5)}
          disabled={zoom >= 100}
          className="p-1 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title={t.zoomIn}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
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
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
