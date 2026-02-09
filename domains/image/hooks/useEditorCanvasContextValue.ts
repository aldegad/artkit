"use client";

import { useMemo } from "react";
import { EditorCanvasContextValue } from "../contexts";

type UseEditorCanvasContextValueOptions = EditorCanvasContextValue;

export function useEditorCanvasContextValue(
  options: UseEditorCanvasContextValueOptions
): EditorCanvasContextValue {
  const {
    containerRef,
    canvasRefCallback,
    layers,
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
  } = options;

  return useMemo(
    () => ({
      containerRef,
      canvasRefCallback,
      layers,
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
    }),
    [
      containerRef,
      canvasRefCallback,
      layers,
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
    ]
  );
}
