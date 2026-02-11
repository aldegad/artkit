"use client";

import BrushCursorOverlay from "@/shared/components/BrushCursorOverlay";

interface PreviewCanvasOverlaysProps {
  isEditingMask: boolean;
  maskDrawShape: "brush" | "rectangle";
  brushCursor: { x: number; y: number } | null;
  brushDisplaySize: number;
  brushHardness: number;
  brushMode: "paint" | "erase";
  draftMode: boolean;
  preRenderEnabled: boolean;
  zoomPercent: number;
}

export function PreviewCanvasOverlays(props: PreviewCanvasOverlaysProps) {
  const {
    isEditingMask,
    maskDrawShape,
    brushCursor,
    brushDisplaySize,
    brushHardness,
    brushMode,
    draftMode,
    preRenderEnabled,
    zoomPercent,
  } = props;

  const showBrushCursor = isEditingMask && maskDrawShape === "brush" && Boolean(brushCursor);
  const showPerfBadge = draftMode || !preRenderEnabled;
  const showZoomIndicator = zoomPercent !== 100;

  return (
    <>
      {showBrushCursor && brushCursor && (
        <BrushCursorOverlay
          x={brushCursor.x}
          y={brushCursor.y}
          size={brushDisplaySize}
          hardness={brushHardness}
          color={brushMode === "erase" ? "#f87171" : "#ffffff"}
          isEraser={brushMode === "erase"}
        />
      )}
      {showPerfBadge && (
        <div className="absolute bottom-2 left-2 rounded bg-surface-primary/80 px-2 py-1 text-[11px] text-text-secondary backdrop-blur-sm pointer-events-none">
          {draftMode ? "Draft" : "Full"} · PR {preRenderEnabled ? "On" : "Off"}
        </div>
      )}
      {showZoomIndicator && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-surface-primary/80 backdrop-blur-sm rounded px-2 py-1 text-[11px] text-text-secondary pointer-events-auto">
          <span>{zoomPercent}%</span>
        </div>
      )}
    </>
  );
}
