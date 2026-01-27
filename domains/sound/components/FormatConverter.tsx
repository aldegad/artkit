"use client";

import { useState, useCallback } from "react";
import { useSoundEditor } from "../contexts/SoundEditorContext";
import { useLanguage } from "@/shared/contexts/LanguageContext";
import { AudioOutputFormat, AUDIO_FORMATS } from "../types";

export function FormatConverter() {
  const { t } = useLanguage();
  const { audioBuffer, fileName, trimRegion, exportTrimmed } = useSoundEditor();
  const [selectedFormat, setSelectedFormat] = useState<AudioOutputFormat>("mp3");
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!audioBuffer) return;

    setIsExporting(true);
    try {
      const blob = await exportTrimmed(selectedFormat);
      if (blob) {
        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;

        // Generate filename
        const baseName = fileName?.replace(/\.[^/.]+$/, "") || "audio";
        const suffix = trimRegion ? "_trimmed" : "";
        // OGG not yet supported, fallback to WAV
        const extension = selectedFormat === "ogg" ? "wav" : selectedFormat;
        a.download = `${baseName}${suffix}.${extension}`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  }, [audioBuffer, selectedFormat, exportTrimmed, fileName, trimRegion]);

  if (!audioBuffer) return null;

  return (
    <div className="flex flex-col gap-3 p-3 bg-gray-800 rounded-lg">
      <span className="text-sm font-medium text-gray-300">{t.export}</span>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-gray-400">{t.format}</label>
        <div className="flex gap-2">
          {AUDIO_FORMATS.map((format) => (
            <button
              key={format.value}
              onClick={() => setSelectedFormat(format.value)}
              className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
                selectedFormat === format.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-300"
              }`}
            >
              {format.label}
            </button>
          ))}
        </div>
      </div>

      {selectedFormat === "ogg" && (
        <p className="text-xs text-yellow-500">
          Note: OGG export is not yet supported. Currently exports as WAV.
        </p>
      )}

      <button
        onClick={handleExport}
        disabled={isExporting}
        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
      >
        {isExporting ? t.converting : t.download}
      </button>
    </div>
  );
}
