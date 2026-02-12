interface PreviewCanvasCursorOptions {
  isPanning: boolean;
  isHandMode: boolean;
  isEditingMask: boolean;
  maskDrawShape: "brush" | "rectangle";
  isZoomTool: boolean;
  toolMode: string;
  isDraggingCrop: boolean;
  cropDragMode: string;
  cropCursor: string;
  transformCursor: string;
  isDraggingClip: boolean;
}

export function resolvePreviewCanvasCursor(options: PreviewCanvasCursorOptions): string {
  if (options.isPanning) return "grabbing";
  if (options.isHandMode) return "grab";
  if (options.isEditingMask) {
    return options.maskDrawShape === "rectangle" ? "crosshair" : "none";
  }
  if (options.isZoomTool) return "zoom-in";
  if (options.toolMode === "crop") {
    if (options.isDraggingCrop) {
      return options.cropDragMode === "move" ? "grabbing" : options.cropCursor;
    }
    return options.cropCursor;
  }
  if (options.toolMode === "transform") return options.transformCursor;
  if (options.isDraggingClip) return "grabbing";
  if (options.toolMode === "select") return "grab";
  return "default";
}
