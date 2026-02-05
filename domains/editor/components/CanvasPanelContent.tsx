"use client";

import { useEditorCanvas } from "../contexts";
import { ImageDropZone } from "../../../shared/components";

export default function CanvasPanelContent() {
  const {
    containerRef,
    layers,
    canvasRefCallback,
    handleDrop,
    handleDragOver,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    getCursor,
    loadImageFile,
  } = useEditorCanvas();

  return (
    <div
      ref={containerRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="w-full h-full overflow-hidden bg-surface-secondary relative"
    >
      {layers.length === 0 ? (
        <ImageDropZone
          variant="editor"
          onFileSelect={(files) => files[0] && loadImageFile(files[0])}
        />
      ) : (
        <canvas
          ref={canvasRefCallback}
          onPointerDown={handleMouseDown}
          onPointerMove={handleMouseMove}
          onPointerUp={handleMouseUp}
          onPointerLeave={handleMouseLeave}
          className="w-full h-full"
          style={{ cursor: getCursor(), imageRendering: "pixelated", touchAction: "none" }}
        />
      )}
    </div>
  );
}
