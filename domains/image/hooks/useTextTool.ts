"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Point, TextLayerData, UnifiedLayer } from "@/shared/types";
import { createPaintLayer } from "../types";
import type { TextDraft, TextStyleSettings } from "../types";
import {
  getTextLayerName,
  renderTextLayerToCanvas,
  TEXT_LAYER_PADDING_BOTTOM,
  TEXT_LAYER_PADDING_TOP,
  TEXT_LAYER_PADDING_X,
} from "../utils/textLayer";

const DEFAULT_TEXT_STYLE: TextStyleSettings = {
  fontFamily: "Arial",
  fontSize: 36,
  fontWeight: "normal",
  fontStyle: "normal",
  textAlign: "left",
  verticalAlign: "top",
  color: "#000000",
  lineHeight: 1.25,
  letterSpacing: 0,
  backgroundColor: null,
  strokeColor: "#000000",
  strokeWidth: 0,
};

export const TEXT_FONT_OPTIONS = [
  "Arial",
  "Verdana",
  "Trebuchet MS",
  "Times New Roman",
  "Georgia",
  "Courier New",
  "Impact",
  "Comic Sans MS",
] as const;

function getMinimumTextBoxSize(style: TextStyleSettings): { width: number; height: number } {
  return {
    width: Math.max(32, Math.ceil(TEXT_LAYER_PADDING_X * 2 + style.fontSize * 0.75)),
    height: Math.max(
      24,
      Math.ceil(TEXT_LAYER_PADDING_TOP + TEXT_LAYER_PADDING_BOTTOM + style.fontSize * style.lineHeight),
    ),
  };
}

interface UseTextToolOptions {
  layers: UnifiedLayer[];
  setLayers: React.Dispatch<React.SetStateAction<UnifiedLayer[]>>;
  setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  layerCanvasesRef: React.RefObject<Map<string, HTMLCanvasElement>>;
  editCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  saveToHistory: () => void;
  toolMode: string;
}

interface UseTextToolReturn {
  textDraft: TextDraft | null;
  textStyle: TextStyleSettings;
  setTextStyle: React.Dispatch<React.SetStateAction<TextStyleSettings>>;
  startTextAt: (point: Point) => void;
  startEditingTextLayer: (layerId: string) => void;
  setTextDraftPosition: (x: number, y: number) => void;
  setTextDraftText: (text: string) => void;
  setTextDraftSize: (width: number, height: number) => void;
  applyTextDraft: () => void;
  cancelTextDraft: () => void;
  clearTextLayerMetadata: (layerIds: string[]) => void;
  hasTextDraft: boolean;
}

export function useTextTool(options: UseTextToolOptions): UseTextToolReturn {
  const {
    layers,
    setLayers,
    setActiveLayerId,
    layerCanvasesRef,
    editCanvasRef,
    saveToHistory,
    toolMode,
  } = options;
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [textStyle, setTextStyle] = useState<TextStyleSettings>(DEFAULT_TEXT_STYLE);
  const lastToolModeRef = useRef(toolMode);

  useEffect(() => {
    const previousToolMode = lastToolModeRef.current;
    lastToolModeRef.current = toolMode;
    if (previousToolMode === "text" && toolMode !== "text") {
      setTextDraft(null);
    }
  }, [toolMode]);

  const startTextAt = useCallback((point: Point) => {
    const minimumBox = getMinimumTextBoxSize(textStyle);
    setTextDraft({
      layerId: null,
      x: Math.round(point.x),
      y: Math.round(point.y),
      width: Math.max(220, minimumBox.width),
      height: Math.max(96, minimumBox.height),
      text: "",
    });
  }, [textStyle]);

  const startEditingTextLayer = useCallback((layerId: string) => {
    const layer = layers.find((item) => item.id === layerId);
    const textData = layer?.textData;
    if (!layer || !textData) return;

    setActiveLayerId(layerId);
    editCanvasRef.current = layerCanvasesRef.current?.get(layerId) || null;
    setTextStyle({
      fontFamily: textData.fontFamily,
      fontSize: textData.fontSize,
      fontWeight: textData.fontWeight,
      fontStyle: textData.fontStyle,
      textAlign: textData.textAlign,
      verticalAlign: textData.verticalAlign ?? "top",
      color: textData.color,
      lineHeight: textData.lineHeight ?? 1.25,
      letterSpacing: textData.letterSpacing ?? 0,
      backgroundColor: textData.backgroundColor ?? null,
      strokeColor: textData.strokeColor ?? "#000000",
      strokeWidth: textData.strokeWidth ?? 0,
    });
    setTextDraft({
      layerId,
      x: layer.position?.x ?? 0,
      y: layer.position?.y ?? 0,
      width: textData.width,
      height: textData.height,
      text: textData.text,
    });
  }, [editCanvasRef, layerCanvasesRef, layers, setActiveLayerId]);

  const setTextDraftText = useCallback((text: string) => {
    setTextDraft((prev) => (prev ? { ...prev, text } : prev));
  }, []);

  const setTextDraftPosition = useCallback((x: number, y: number) => {
    setTextDraft((prev) => (
      prev
        ? {
            ...prev,
            x: Math.round(x),
            y: Math.round(y),
          }
        : prev
    ));
  }, []);

  const setTextDraftSize = useCallback((width: number, height: number) => {
    setTextDraft((prev) => {
      if (!prev) return prev;
      const minimumBox = getMinimumTextBoxSize(textStyle);
      return {
        ...prev,
        width: Math.max(minimumBox.width, Math.round(width)),
        height: Math.max(minimumBox.height, Math.round(height)),
      };
    });
  }, [textStyle]);

  const cancelTextDraft = useCallback(() => {
    setTextDraft(null);
  }, []);

  const clearTextLayerMetadata = useCallback((layerIds: string[]) => {
    if (layerIds.length === 0) return;
    const targetIds = new Set(layerIds);
    if (textDraft?.layerId && targetIds.has(textDraft.layerId)) {
      setTextDraft(null);
    }
    setLayers((prev) => prev.map((layer) => (
      targetIds.has(layer.id) && layer.textData
        ? { ...layer, textData: undefined }
        : layer
    )));
  }, [setLayers, textDraft]);

  const applyTextDraft = useCallback(() => {
    if (!textDraft) return;

    const text = textDraft.text.trim();
    if (!text) {
      setTextDraft(null);
      return;
    }

    const textData: TextLayerData = {
      text: textDraft.text,
      width: Math.max(getMinimumTextBoxSize(textStyle).width, Math.round(textDraft.width)),
      height: Math.max(getMinimumTextBoxSize(textStyle).height, Math.round(textDraft.height)),
      fontFamily: textStyle.fontFamily,
      fontSize: textStyle.fontSize,
      fontWeight: textStyle.fontWeight,
      fontStyle: textStyle.fontStyle,
      textAlign: textStyle.textAlign,
      verticalAlign: textStyle.verticalAlign,
      color: textStyle.color,
      lineHeight: textStyle.lineHeight,
      letterSpacing: textStyle.letterSpacing,
      backgroundColor: textStyle.backgroundColor,
      strokeColor: textStyle.strokeColor,
      strokeWidth: textStyle.strokeWidth,
    };

    saveToHistory();

    if (textDraft.layerId) {
      const existingLayer = layers.find((layer) => layer.id === textDraft.layerId);
      if (!existingLayer) {
        setTextDraft(null);
        return;
      }

      const canvas = layerCanvasesRef.current?.get(existingLayer.id) || document.createElement("canvas");
      renderTextLayerToCanvas(canvas, textData);
      layerCanvasesRef.current?.set(existingLayer.id, canvas);
      editCanvasRef.current = canvas;

      setLayers((prev) => prev.map((layer) => (
        layer.id === existingLayer.id
          ? {
              ...layer,
              name: getTextLayerName(text, prev.length),
              position: { x: Math.round(textDraft.x), y: Math.round(textDraft.y) },
              textData,
            }
          : layer
      )));
      setActiveLayerId(existingLayer.id);
      setTextDraft(null);
      return;
    }

    const newLayer = createPaintLayer(getTextLayerName(text, layers.length + 1), layers.length);
    const maxZIndex = layers.length > 0 ? Math.max(...layers.map((layer) => layer.zIndex)) + 1 : 0;
    const newCanvas = document.createElement("canvas");
    renderTextLayerToCanvas(newCanvas, textData);
    layerCanvasesRef.current?.set(newLayer.id, newCanvas);
    editCanvasRef.current = newCanvas;

    setLayers((prev) => [
      {
        ...newLayer,
        zIndex: maxZIndex,
        position: { x: Math.round(textDraft.x), y: Math.round(textDraft.y) },
        textData,
      },
      ...prev,
    ]);
    setActiveLayerId(newLayer.id);
    setTextDraft(null);
  }, [
    editCanvasRef,
    layerCanvasesRef,
    layers,
    saveToHistory,
    setActiveLayerId,
    setLayers,
    textDraft,
    textStyle,
  ]);

  return useMemo(() => ({
    textDraft,
    textStyle,
    setTextStyle,
    startTextAt,
    startEditingTextLayer,
    setTextDraftPosition,
    setTextDraftText,
    setTextDraftSize,
    applyTextDraft,
    cancelTextDraft,
    clearTextLayerMetadata,
    hasTextDraft: !!textDraft,
  }), [
    textDraft,
    textStyle,
    startTextAt,
    startEditingTextLayer,
    setTextDraftPosition,
    setTextDraftText,
    setTextDraftSize,
    applyTextDraft,
    cancelTextDraft,
    clearTextLayerMetadata,
  ]);
}
