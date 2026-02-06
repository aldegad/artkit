"use client";

import { useSoundEditor } from "../contexts/SoundEditorContext";
import { useLanguage } from "@/shared/contexts/LanguageContext";
import { PlayIcon24, PauseIcon24, StopIcon24 } from "@/shared/components/icons";

export function PlaybackControls() {
  const { t } = useLanguage();
  const {
    audioBuffer,
    isPlaying,
    currentTime,
    duration,
    play,
    pause,
    stop,
  } = useSoundEditor();

  if (!audioBuffer) return null;

  return (
    <div className="flex items-center gap-3">
      {/* Play/Pause Button */}
      <button
        onClick={isPlaying ? pause : play}
        className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
        title={isPlaying ? t.pause : t.play}
      >
        {isPlaying ? (
          <PauseIcon24 className="w-5 h-5" />
        ) : (
          <PlayIcon24 className="w-5 h-5 ml-0.5" />
        )}
      </button>

      {/* Stop Button */}
      <button
        onClick={stop}
        className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded transition-colors"
        title="Stop"
      >
        <StopIcon24 />
      </button>

      {/* Time Display */}
      <div className="flex items-center gap-2 text-sm font-mono">
        <span className="text-white">{formatTime(currentTime)}</span>
        <span className="text-gray-500">/</span>
        <span className="text-gray-400">{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}
