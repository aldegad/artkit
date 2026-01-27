"use client";

import { useLanguage } from "../../shared/contexts";
import {
  SoundEditorProvider,
  useSoundEditor,
  Waveform,
  TrimControls,
  FormatConverter,
  PlaybackControls,
  AudioDropZone,
  SoundToolbar,
} from "../../domains/sound";

function SoundEditorContent() {
  const { t } = useLanguage();
  const { audioBuffer, fileName, duration } = useSoundEditor();

  return (
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-primary border-b border-border-default shrink-0 shadow-sm h-12">
        <h1 className="text-sm font-semibold">{t.soundEditor}</h1>

        {audioBuffer && (
          <>
            <div className="h-6 w-px bg-border-default" />

            <span className="text-sm text-text-secondary truncate max-w-[200px]" title={fileName || ""}>
              {fileName}
            </span>

            <span className="text-xs text-text-tertiary">
              ({formatDuration(duration)})
            </span>
          </>
        )}

        </div>

      {/* Main Content */}
      {!audioBuffer ? (
        <div className="flex-1 relative">
          <AudioDropZone />
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-2 bg-surface-secondary border-b border-border-default">
            <SoundToolbar />
          </div>

          {/* Waveform Area */}
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
            {/* Waveform Display */}
            <div className="flex-1 min-h-[200px] bg-gray-900 rounded-lg overflow-hidden">
              <Waveform className="w-full h-full" />
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center py-2">
              <PlaybackControls />
            </div>

            {/* Bottom Panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TrimControls />
              <FormatConverter />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SoundEditorPage() {
  return (
    <SoundEditorProvider>
      <SoundEditorContent />
    </SoundEditorProvider>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return `${secs}s`;
}
