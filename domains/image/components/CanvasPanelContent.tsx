"use client";

import { useEditorCanvas, useEditorState } from "../contexts";
import { ImageDropZone } from "../../../shared/components";
import { RulerContainer } from "./rulers";

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
    displaySize,
    onGuideCreate,
    onGuideDragStateChange,
  } = useEditorCanvas();

  const {
    state: { showRulers, zoom, pan },
  } = useEditorState();

  const canvasContent = (
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

  return (
    <RulerContainer
      showRulers={showRulers}
      zoom={zoom}
      pan={pan}
      displaySize={displaySize}
      onGuideCreate={onGuideCreate}
      onGuideDragStateChange={onGuideDragStateChange}
    >
      {canvasContent}
    </RulerContainer>
  );
}
