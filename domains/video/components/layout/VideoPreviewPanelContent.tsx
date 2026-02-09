"use client";

import { useCallback, useState } from "react";
import { useTimeline } from "../../contexts";
import { useMediaImport } from "../../hooks";
import { PreviewCanvas, PreviewControls } from "../preview";
import ImageDropZone from "@/shared/components/ImageDropZone";
import { SUPPORTED_VIDEO_FORMATS, SUPPORTED_IMAGE_FORMATS, SUPPORTED_AUDIO_FORMATS } from "../../constants";
import { useLanguage } from "@/shared/contexts";

const ACCEPTED_FORMATS = [
  ...SUPPORTED_VIDEO_FORMATS,
  ...SUPPORTED_IMAGE_FORMATS,
  ...SUPPORTED_AUDIO_FORMATS,
];

const ACCEPTED_FORMATS_STR = ACCEPTED_FORMATS.join(",");

export function VideoPreviewPanelContent() {
  const { clips } = useTimeline();
  const { importFiles } = useMediaImport();
  const { t } = useLanguage();
  const hasContent = clips.length > 0;
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        ACCEPTED_FORMATS.some((a) => {
          if (a.endsWith("/*")) return f.type.startsWith(a.replace("/*", "/"));
          if (a.startsWith(".")) return f.name.toLowerCase().endsWith(a.toLowerCase());
          return f.type === a;
        })
      );
      if (files.length > 0) {
        importFiles(files);
      }
    },
    [importFiles]
  );

  return (
    <div className="h-full bg-surface-primary flex flex-col overflow-hidden">
      {!hasContent ? (
        <ImageDropZone
          variant="video"
          accept={ACCEPTED_FORMATS_STR}
          onFileSelect={importFiles}
        />
      ) : (
        <div
          className="flex-1 flex flex-col min-h-0 relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex-1 min-h-0 relative">
            <PreviewCanvas />
          </div>
          <PreviewControls />

          {/* Drop overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-20 bg-accent-primary/10 border-2 border-dashed border-accent-primary rounded-lg flex items-center justify-center pointer-events-none">
              <div className="bg-surface-primary/90 px-6 py-4 rounded-xl text-center">
                <p className="text-lg text-accent-primary font-medium">
                  {t.dropMediaHere}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
