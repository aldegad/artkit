"use client";

import { useMask, useTimeline } from "../../contexts";
import { useMediaImport } from "../../hooks";
import { MaskControls } from "../mask";
import { PreviewCanvas, PreviewControls } from "../preview";
import ImageDropZone from "@/shared/components/ImageDropZone";
import { SUPPORTED_VIDEO_FORMATS, SUPPORTED_IMAGE_FORMATS, SUPPORTED_AUDIO_FORMATS } from "../../constants";

const ACCEPTED_FORMATS = [
  ...SUPPORTED_VIDEO_FORMATS,
  ...SUPPORTED_IMAGE_FORMATS,
  ...SUPPORTED_AUDIO_FORMATS,
].join(",");

export function VideoPreviewPanelContent() {
  const { clips } = useTimeline();
  const { isEditingMask } = useMask();
  const { importFiles } = useMediaImport();
  const hasContent = clips.length > 0;

  return (
    <div className="h-full bg-surface-primary flex flex-col overflow-hidden">
      {!hasContent ? (
        <ImageDropZone
          variant="video"
          accept={ACCEPTED_FORMATS}
          onFileSelect={importFiles}
        />
      ) : (
        <>
          <div className="flex-1 min-h-0 relative">
            <PreviewCanvas />
            {isEditingMask && (
              <div className="absolute top-4 right-4 z-10">
                <MaskControls />
              </div>
            )}
          </div>
          <PreviewControls />
        </>
      )}
    </div>
  );
}
