"use client";

import { useLanguage } from "@/shared/contexts";
import { HeaderContent } from "@/shared/components";
import { SplitView } from "@/shared/components/layout";
import {
  SoundEditorProvider,
  useSoundEditor,
  SoundLayoutProvider,
  useSoundLayout,
  AudioDropZone,
} from "@/domains/sound";
import SoundMenuBar from "@/domains/sound/components/SoundMenuBar";

function SoundEditorContent() {
  const { t } = useLanguage();
  const { audioBuffer, fileName, duration } = useSoundEditor();
  const { panelHeadersVisible, togglePanelHeaders, resetLayout } = useSoundLayout();

  return (
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden">
      {/* Header Slot */}
      <HeaderContent
        title={t.soundEditor}
        menuBar={
          audioBuffer ? (
            <SoundMenuBar
              panelHeadersVisible={panelHeadersVisible}
              onTogglePanelHeaders={togglePanelHeaders}
              onResetLayout={resetLayout}
              translations={{
                view: t.view,
                window: t.window,
                panelHeaders: t.panelHeaders,
                resetLayout: t.resetLayout,
              }}
            />
          ) : undefined
        }
        info={audioBuffer ? (
          <>
            <span className="text-sm text-text-secondary truncate max-w-[150px]" title={fileName || ""}>
              {fileName}
            </span>
            <span className="text-xs text-text-tertiary whitespace-nowrap">
              ({formatDuration(duration)})
            </span>
          </>
        ) : undefined}
      />

      {/* Main Content */}
      {!audioBuffer ? (
        <div className="flex-1 relative">
          <AudioDropZone />
        </div>
      ) : (
        <SplitView />
      )}
    </div>
  );
}

export default function SoundEditorPage() {
  return (
    <SoundEditorProvider>
      <SoundLayoutProvider>
        <SoundEditorContent />
      </SoundLayoutProvider>
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
