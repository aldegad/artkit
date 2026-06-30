"use client";

import { createElement, useCallback, type RefObject } from "react";
import { TextEditorCanvasOverlay } from "../components/TextEditorCanvasOverlay";
import type {
  EditorToolMode,
  Point,
  Size,
  TextDraft,
  TextStyleSettings,
  UnifiedLayer,
} from "../types";
import { getTextLayerHitType, isPointInsideTextLayer } from "../utils/textLayer";

interface UseTextLayerEditingOptions {
  toolMode: EditorToolMode;
  layers: UnifiedLayer[];
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  displaySize: Size;
  zoom: number;
  pan: Point;
  textDraft: TextDraft | null;
  textStyle: TextStyleSettings;
  hasTextDraft: boolean;
  getMousePos: (event: React.MouseEvent | PointerEvent) => Point;
  screenToImage: (x: number, y: number) => Point;
  handleMouseDown: (event: React.MouseEvent | React.PointerEvent) => void;
  handleToolModeChange: (mode: EditorToolMode) => void;
  startEditingTextLayer: (layerId: string) => void;
  startTextAt: (point: Point) => void;
  applyTextDraft: () => void;
  cancelTextDraft: () => void;
  setTextDraftPosition: (x: number, y: number) => void;
  setTextDraftText: (text: string) => void;
  setTextDraftSize: (width: number, height: number) => void;
  requestRender: () => void;
}

export function useTextLayerEditing(options: UseTextLayerEditingOptions) {
  const {
    toolMode,
    layers,
    layerCanvasesRef,
    canvasRef,
    displaySize,
    zoom,
    pan,
    textDraft,
    textStyle,
    hasTextDraft,
    getMousePos,
    screenToImage,
    handleMouseDown,
    handleToolModeChange,
    startEditingTextLayer,
    startTextAt,
    applyTextDraft,
    cancelTextDraft,
    setTextDraftPosition,
    setTextDraftText,
    setTextDraftSize,
    requestRender,
  } = options;

  const handleTextCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if ((toolMode !== "text" && toolMode !== "move") || e.button !== 0) {
      handleMouseDown(e);
      return;
    }

    const mousePos = getMousePos(e);
    const imagePos = screenToImage(mousePos.x, mousePos.y);

    if (hasTextDraft) {
      applyTextDraft();
    }

    const hitTextLayer = [...layers]
      .sort((a, b) => b.zIndex - a.zIndex)
      .find((layer) => !layer.locked && isPointInsideTextLayer(layer, imagePos));

    if (hitTextLayer) {
      const hitType = getTextLayerHitType(
        hitTextLayer,
        imagePos,
        layerCanvasesRef.current.get(hitTextLayer.id) || null,
      );

      if (hitType === "content") {
        if (toolMode !== "text") {
          handleToolModeChange("text");
        }
        startEditingTextLayer(hitTextLayer.id);
        return;
      }

      if (toolMode === "move") {
        handleMouseDown(e);
        return;
      }

      if (toolMode !== "text") {
        handleToolModeChange("text");
      }
      startEditingTextLayer(hitTextLayer.id);
      return;
    }

    if (toolMode !== "text") {
      handleMouseDown(e);
      return;
    }

    startTextAt(imagePos);
  }, [
    applyTextDraft,
    getMousePos,
    handleToolModeChange,
    handleMouseDown,
    hasTextDraft,
    layers,
    layerCanvasesRef,
    screenToImage,
    startEditingTextLayer,
    startTextAt,
    toolMode,
  ]);

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
    const mousePos = getMousePos(e);
    const imagePos = screenToImage(mousePos.x, mousePos.y);
    const hitTextLayer = [...layers]
      .sort((a, b) => b.zIndex - a.zIndex)
      .find((layer) => !layer.locked && isPointInsideTextLayer(layer, imagePos));

    if (!hitTextLayer) return;

    if (hasTextDraft) {
      applyTextDraft();
    }

    handleToolModeChange("text");
    startEditingTextLayer(hitTextLayer.id);
  }, [
    applyTextDraft,
    getMousePos,
    handleToolModeChange,
    hasTextDraft,
    layers,
    screenToImage,
    startEditingTextLayer,
  ]);

  const handleApplyTextDraft = useCallback(() => {
    applyTextDraft();
    requestRender();
  }, [applyTextDraft, requestRender]);

  const handleCancelTextDraft = useCallback(() => {
    cancelTextDraft();
    requestRender();
  }, [cancelTextDraft, requestRender]);

  const textOverlay = createElement(TextEditorCanvasOverlay, {
    canvasRef,
    displaySize,
    zoom,
    pan,
    draft: textDraft,
    styleSettings: textStyle,
    onChangePosition: setTextDraftPosition,
    onChangeText: setTextDraftText,
    onChangeSize: setTextDraftSize,
    onApply: handleApplyTextDraft,
    onCancel: handleCancelTextDraft,
  });

  return {
    handleTextCanvasPointerDown,
    handleCanvasDoubleClick,
    handleApplyTextDraft,
    handleCancelTextDraft,
    textOverlay,
  };
}
