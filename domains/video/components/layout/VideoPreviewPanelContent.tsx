"use client";

import { useMask, useTimeline } from "../../contexts";
import { AssetDropZone } from "../assets";
import { MaskControls } from "../mask";
import { PreviewCanvas, PreviewControls } from "../preview";

export function VideoPreviewPanelContent() {
  const { clips } = useTimeline();
  const { isEditingMask } = useMask();
  const hasContent = clips.length > 0;

  return (
    <div className="h-full bg-surface-primary flex flex-col overflow-hidden">
      {!hasContent ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <AssetDropZone className="max-w-md w-full" />
        </div>
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
