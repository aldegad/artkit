"use client";

import { cn } from "@/shared/utils/cn";
import { PreviewCanvasOverlays } from "./PreviewCanvasOverlays";
import { usePreviewCanvasController } from "./usePreviewCanvasController";

interface PreviewCanvasProps {
  className?: string;
}

export function PreviewCanvas({ className }: PreviewCanvasProps) {
  const controller = usePreviewCanvasController();

  return (
    <div
      ref={controller.containerRefCallback}
      data-video-preview-root=""
      className={cn("relative w-full h-full overflow-hidden focus:outline-none bg-[var(--surface-primary)]", className)}
      tabIndex={0}
      onPointerDownCapture={(e) => {
        e.currentTarget.focus();
      }}
    >
      <div
        ref={controller.directPreviewHostRef}
        className="absolute inset-0 pointer-events-none"
        style={{ display: "none" }}
      />
      <canvas
        ref={controller.previewCanvasRef}
        className="absolute inset-0 z-10"
        tabIndex={0}
        style={{ cursor: controller.canvasCursor, touchAction: "none" }}
        onPointerDown={controller.handlePointerDown}
        onPointerMove={controller.handlePointerMove}
        onPointerUp={controller.handlePointerUp}
        onPointerCancel={controller.handlePointerUp}
        onPointerLeave={controller.clearBrushCursor}
      />
      <PreviewCanvasOverlays
        isEditingMask={controller.isEditingMask}
        isInpaintMode={controller.isInpaintMode}
        maskDrawShape={controller.maskDrawShape}
        brushCursor={controller.brushCursor}
        brushDisplaySize={controller.brushDisplaySize}
        brushHardness={controller.brushHardness}
        brushMode={controller.brushMode}
        draftMode={controller.draftMode}
        preRenderEnabled={controller.effectivePreRenderEnabled}
        zoomPercent={controller.zoomPercent}
      />
    </div>
  );
}
