"use client";

import { useCallback, RefObject } from "react";
import { UnifiedLayer, CropArea } from "../types";

interface UseEditorCanvasActionsOptions {
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  editCanvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  cropArea: CropArea | null;
  rotation: number;
  canvasSize: { width: number; height: number };
  getDisplayDimensions: () => { width: number; height: number };
  rotateAllLayerCanvases: (degrees: number) => void;
  saveToHistory: () => void;
  setLayers: React.Dispatch<React.SetStateAction<UnifiedLayer[]>>;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setRotation: (rotation: number) => void;
  setCropArea: React.Dispatch<React.SetStateAction<CropArea | null>>;
  setCanvasExpandMode: React.Dispatch<React.SetStateAction<boolean>>;
  setZoom: (zoom: number | ((z: number) => number)) => void;
  setPan: (pan: { x: number; y: number } | ((p: { x: number; y: number }) => { x: number; y: number })) => void;
}

interface UseEditorCanvasActionsReturn {
  rotate: (degrees: number) => void;
  fitToScreen: () => void;
  handleApplyCrop: () => void;
}

export function useEditorCanvasActions(
  options: UseEditorCanvasActionsOptions
): UseEditorCanvasActionsReturn {
  const {
    layers,
    activeLayerId,
    layerCanvasesRef,
    editCanvasRef,
    containerRef,
    cropArea,
    rotation,
    canvasSize,
    getDisplayDimensions,
    rotateAllLayerCanvases,
    saveToHistory,
    setLayers,
    setCanvasSize,
    setRotation,
    setCropArea,
    setCanvasExpandMode,
    setZoom,
    setPan,
  } = options;

  const rotate = useCallback((degrees: number) => {
    const newRotation = (rotation + degrees + 360) % 360;
    setRotation(newRotation);
    setCropArea(null);
    rotateAllLayerCanvases(degrees);
  }, [rotation, setRotation, setCropArea, rotateAllLayerCanvases]);

  const fitToScreen = useCallback(() => {
    if (!containerRef.current || !canvasSize.width) return;

    const container = containerRef.current;
    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
    const padding = 40;
    const maxWidth = container.clientWidth - padding;
    const maxHeight = container.clientHeight - padding;
    const newZoom = Math.min(maxWidth / displayWidth, maxHeight / displayHeight, 1);
    setZoom(newZoom);
    setPan({ x: 0, y: 0 });
  }, [containerRef, canvasSize.width, getDisplayDimensions, setZoom, setPan]);

  const handleApplyCrop = useCallback(() => {
    if (!cropArea) return;

    const newWidth = Math.round(cropArea.width);
    const newHeight = Math.round(cropArea.height);
    const offsetX = Math.round(cropArea.x);
    const offsetY = Math.round(cropArea.y);

    const updatedLayers = layers.map((layer) => {
      const oldCanvas = layerCanvasesRef.current?.get(layer.id);
      if (!oldCanvas) return layer;

      const layerPosX = layer.position?.x || 0;
      const layerPosY = layer.position?.y || 0;

      const newCanvas = document.createElement("canvas");
      newCanvas.width = newWidth;
      newCanvas.height = newHeight;
      const ctx = newCanvas.getContext("2d");
      if (!ctx) return layer;

      const cropInLayerX = offsetX - layerPosX;
      const cropInLayerY = offsetY - layerPosY;

      const srcX = Math.max(0, cropInLayerX);
      const srcY = Math.max(0, cropInLayerY);
      const srcRight = Math.min(oldCanvas.width, cropInLayerX + newWidth);
      const srcBottom = Math.min(oldCanvas.height, cropInLayerY + newHeight);
      const srcWidth = Math.max(0, srcRight - srcX);
      const srcHeight = Math.max(0, srcBottom - srcY);

      const destX = srcX - cropInLayerX;
      const destY = srcY - cropInLayerY;

      if (srcWidth > 0 && srcHeight > 0) {
        ctx.drawImage(
          oldCanvas,
          srcX,
          srcY,
          srcWidth,
          srcHeight,
          destX,
          destY,
          srcWidth,
          srcHeight
        );
      }

      layerCanvasesRef.current?.set(layer.id, newCanvas);

      if (layer.id === activeLayerId) {
        editCanvasRef.current = newCanvas;
      }

      return {
        ...layer,
        position: { x: 0, y: 0 },
      };
    });

    setLayers(updatedLayers);
    setCanvasSize({ width: newWidth, height: newHeight });

    if (rotation !== 0) {
      setRotation(0);
    }

    setCropArea(null);
    setCanvasExpandMode(false);
    saveToHistory();

    setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      const padding = 40;
      const maxWidth = container.clientWidth - padding;
      const maxHeight = container.clientHeight - padding;
      const fitZoom = Math.min(maxWidth / newWidth, maxHeight / newHeight, 1);
      setZoom(fitZoom);
      setPan({ x: 0, y: 0 });
    }, 0);
  }, [
    cropArea,
    layers,
    layerCanvasesRef,
    activeLayerId,
    editCanvasRef,
    setLayers,
    setCanvasSize,
    rotation,
    setRotation,
    setCropArea,
    setCanvasExpandMode,
    saveToHistory,
    containerRef,
    setZoom,
    setPan,
  ]);

  return {
    rotate,
    fitToScreen,
    handleApplyCrop,
  };
}
