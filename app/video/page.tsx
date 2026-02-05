"use client";

import { useLanguage, HeaderSlot } from "../../shared/contexts";
import {
  VideoStateProvider,
  VideoRefsProvider,
  TimelineProvider,
  MaskProvider,
  useVideoState,
  useTimeline,
  useMask,
  PreviewCanvas,
  PreviewControls,
  Timeline,
  AssetDropZone,
  MaskControls,
} from "../../domains/video";

function VideoEditorContent() {
  const { t } = useLanguage();
  const { project, projectName, toolMode, setToolMode, selectedClipIds } = useVideoState();
  const { clips } = useTimeline();
  const { isEditingMask, startMaskEdit } = useMask();

  const hasContent = clips.length > 0;

  // Handle mask tool toggle
  const handleMaskTool = () => {
    if (toolMode === "mask") {
      setToolMode("select");
    } else {
      setToolMode("mask");
      // Start mask edit on selected clip
      if (selectedClipIds.length > 0) {
        const selectedClip = clips.find((c) => c.id === selectedClipIds[0]);
        if (selectedClip) {
          startMaskEdit(selectedClip.id, selectedClip.sourceSize);
        }
      }
    }
  };

  return (
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden">
      {/* Header Slot */}
      <HeaderSlot>
        <h1 className="text-sm font-semibold whitespace-nowrap">
          {t.videoEditor}
        </h1>
        <div className="h-4 w-px bg-border-default" />
        <span className="text-sm text-text-secondary truncate max-w-[200px]">
          {projectName}
        </span>
        <span className="text-xs text-text-tertiary whitespace-nowrap">
          ({project.canvasSize.width}x{project.canvasSize.height})
        </span>

        {/* Mask Tool Button */}
        {hasContent && (
          <>
            <div className="h-4 w-px bg-border-default ml-2" />
            <button
              onClick={handleMaskTool}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                toolMode === "mask"
                  ? "bg-accent text-white"
                  : "bg-surface-tertiary hover:bg-surface-tertiary/80 text-text-secondary"
              }`}
              title="Mask Tool (M)"
            >
              Mask
            </button>
          </>
        )}
      </HeaderSlot>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Preview + Drop Zone Area */}
        <div className="flex-1 min-h-0 flex">
          {/* Preview Canvas Area */}
          <div className="flex-1 flex flex-col bg-surface-primary relative">
            {!hasContent ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <AssetDropZone className="max-w-md w-full" />
              </div>
            ) : (
              <div className="flex-1 relative">
                <PreviewCanvas />

                {/* Mask Controls Panel (floating) */}
                {isEditingMask && (
                  <div className="absolute top-4 right-4 z-10">
                    <MaskControls />
                  </div>
                )}
              </div>
            )}

            {/* Preview Controls */}
            <PreviewControls />
          </div>
        </div>

        {/* Timeline Area */}
        <div className="h-64 border-t border-border shrink-0">
          <Timeline className="h-full" />
        </div>
      </div>
    </div>
  );
}

function VideoEditorWithMask() {
  return (
    <MaskProvider>
      <VideoEditorContent />
    </MaskProvider>
  );
}

function VideoEditorWithTimeline() {
  return (
    <TimelineProvider>
      <VideoEditorWithMask />
    </TimelineProvider>
  );
}

export default function VideoEditorPage() {
  return (
    <VideoStateProvider>
      <VideoRefsProvider>
        <VideoEditorWithTimeline />
      </VideoRefsProvider>
    </VideoStateProvider>
  );
}
