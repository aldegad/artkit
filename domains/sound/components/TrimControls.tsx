"use client";

import { useSoundEditor } from "../contexts/SoundEditorContext";
import { useLanguage } from "@/shared/contexts/LanguageContext";

export function TrimControls() {
  const { t } = useLanguage();
  const {
    duration,
    trimRegion,
    setTrimRegion,
    audioBuffer,
  } = useSoundEditor();

  if (!audioBuffer) return null;

  const handleStartChange = (value: number) => {
    const start = Math.max(0, Math.min(value, (trimRegion?.end || duration) - 0.01));
    setTrimRegion({
      start,
      end: trimRegion?.end || duration,
    });
  };

  const handleEndChange = (value: number) => {
    const end = Math.max((trimRegion?.start || 0) + 0.01, Math.min(value, duration));
    setTrimRegion({
      start: trimRegion?.start || 0,
      end,
    });
  };

  const clearTrimRegion = () => {
    setTrimRegion(null);
  };

  const selectAll = () => {
    setTrimRegion({ start: 0, end: duration });
  };

  const trimmedDuration = trimRegion
    ? trimRegion.end - trimRegion.start
    : duration;

  return (
    <div className="flex flex-col gap-3 p-3 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">{t.crop}</span>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            {t.select} All
          </button>
          {trimRegion && (
            <button
              onClick={clearTrimRegion}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              {t.reset}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Start</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={trimRegion?.end || duration}
              step={0.01}
              value={(trimRegion?.start || 0).toFixed(2)}
              onChange={(e) => handleStartChange(parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
            />
            <span className="text-xs text-gray-500">s</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">End</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={trimRegion?.start || 0}
              max={duration}
              step={0.01}
              value={(trimRegion?.end || duration).toFixed(2)}
              onChange={(e) => handleEndChange(parseFloat(e.target.value) || duration)}
              className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
            />
            <span className="text-xs text-gray-500">s</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-700">
        <span>Duration: {formatTime(trimmedDuration)}</span>
        <span>Original: {formatTime(duration)}</span>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  return mins > 0 ? `${mins}:${secs.padStart(5, "0")}` : `${secs}s`;
}
