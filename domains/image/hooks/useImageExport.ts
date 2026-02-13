"use client";

import { useCallback, RefObject } from "react";
import { UnifiedLayer, OutputFormat, CropArea } from "../types";
import { drawLayerWithOptionalAlphaMask } from "@/shared/utils/layerAlphaMask";

interface UseImageExportOptions {
  layers: UnifiedLayer[];
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  cropArea: CropArea | null;
  selectedLayerIds: string[];
  activeLayerId: string | null;
  getDisplayDimensions: () => { width: number; height: number };
}

interface UseImageExportReturn {
  exportImage: (fileName: string, format: OutputFormat, quality: number) => void;
  exportSelectedLayers: (
    fileName: string,
    format: OutputFormat,
    quality: number,
    backgroundColor: string | null
  ) => Promise<void>;
  handleExportFromModal: (
    fileName: string,
    format: OutputFormat,
    quality: number,
    backgroundColor: string | null,
    mode: "single" | "layers"
  ) => void;
}

export function useImageExport(options: UseImageExportOptions): UseImageExportReturn {
  const {
    layers,
    layerCanvasesRef,
    cropArea,
    selectedLayerIds,
    activeLayerId,
    getDisplayDimensions,
  } = options;

  const exportImage = useCallback((fileName: string, format: OutputFormat, quality: number) => {
    if (layers.length === 0) return;

    const exportCanvas = document.createElement("canvas");
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return;

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = displayWidth;
    compositeCanvas.height = displayHeight;
    const compositeCtx = compositeCanvas.getContext("2d");
    if (!compositeCtx) return;

    const sortedVisibleLayers = [...layers]
      .filter((layer) => layer.visible)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    sortedVisibleLayers.forEach((layer) => {
      if (!layer.visible) return;
      const layerCanvas = layerCanvasesRef.current?.get(layer.id);
      if (!layerCanvas) return;

      compositeCtx.globalAlpha = layer.opacity / 100;
      const posX = layer.position?.x || 0;
      const posY = layer.position?.y || 0;
      drawLayerWithOptionalAlphaMask(compositeCtx, layerCanvas, posX, posY);
      compositeCtx.globalAlpha = 1;
    });

    if (cropArea) {
      exportCanvas.width = Math.round(cropArea.width);
      exportCanvas.height = Math.round(cropArea.height);

      const extendsLeft = cropArea.x < 0;
      const extendsTop = cropArea.y < 0;
      const extendsRight = cropArea.x + cropArea.width > displayWidth;
      const extendsBottom = cropArea.y + cropArea.height > displayHeight;
      const extendsCanvas = extendsLeft || extendsTop || extendsRight || extendsBottom;

      if (extendsCanvas) {
        if (format === "jpeg") {
          exportCtx.fillStyle = "#ffffff";
          exportCtx.fillRect(0, 0, cropArea.width, cropArea.height);
        }

        const srcX = Math.max(0, cropArea.x);
        const srcY = Math.max(0, cropArea.y);
        const srcRight = Math.min(displayWidth, cropArea.x + cropArea.width);
        const srcBottom = Math.min(displayHeight, cropArea.y + cropArea.height);
        const srcWidth = srcRight - srcX;
        const srcHeight = srcBottom - srcY;
        const destX = srcX - cropArea.x;
        const destY = srcY - cropArea.y;

        if (srcWidth > 0 && srcHeight > 0) {
          exportCtx.drawImage(
            compositeCanvas,
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
      } else {
        exportCtx.drawImage(
          compositeCanvas,
          Math.round(cropArea.x),
          Math.round(cropArea.y),
          Math.round(cropArea.width),
          Math.round(cropArea.height),
          0,
          0,
          Math.round(cropArea.width),
          Math.round(cropArea.height),
        );
      }
    } else {
      exportCanvas.width = displayWidth;
      exportCanvas.height = displayHeight;

      if (format === "jpeg") {
        exportCtx.fillStyle = "#ffffff";
        exportCtx.fillRect(0, 0, displayWidth, displayHeight);
      }
      exportCtx.drawImage(compositeCanvas, 0, 0);
    }

    const mimeType = format === "webp" ? "image/webp" : format === "jpeg" ? "image/jpeg" : "image/png";
    const extension = format === "jpeg" ? "jpg" : format;

    exportCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileName}.${extension}`;
        link.click();
        URL.revokeObjectURL(url);
      },
      mimeType,
      quality,
    );
  }, [layers, layerCanvasesRef, cropArea, getDisplayDimensions]);

  const exportSelectedLayers = useCallback(async (
    fileName: string,
    format: OutputFormat,
    quality: number,
    backgroundColor: string | null
  ) => {
    const targetIds = selectedLayerIds.length > 0 ? selectedLayerIds : (activeLayerId ? [activeLayerId] : []);
    if (targetIds.length === 0) return;

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
    const mimeType = format === "webp" ? "image/webp" : format === "jpeg" ? "image/jpeg" : "image/png";
    const extension = format === "jpeg" ? "jpg" : format;

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    const blobPromises = targetIds.map((layerId) => {
      const layer = layers.find((entry) => entry.id === layerId);
      if (!layer) return null;

      const layerCanvas = layerCanvasesRef.current?.get(layerId);
      if (!layerCanvas) return null;

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = displayWidth;
      exportCanvas.height = displayHeight;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) return null;

      if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, displayWidth, displayHeight);
      } else if (format === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, displayWidth, displayHeight);
      }

      const posX = layer.position?.x || 0;
      const posY = layer.position?.y || 0;
      ctx.globalAlpha = layer.opacity / 100;
      drawLayerWithOptionalAlphaMask(ctx, layerCanvas, posX, posY);
      ctx.globalAlpha = 1;

      return new Promise<void>((resolve) => {
        exportCanvas.toBlob(
          (blob) => {
            if (blob) {
              zip.file(`${layer.name || "layer"}.${extension}`, blob);
            }
            resolve();
          },
          mimeType,
          quality,
        );
      });
    });

    await Promise.all(blobPromises.filter(Boolean));

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  }, [layers, selectedLayerIds, activeLayerId, layerCanvasesRef, getDisplayDimensions]);

  const handleExportFromModal = useCallback((
    fileName: string,
    format: OutputFormat,
    quality: number,
    backgroundColor: string | null,
    mode: "single" | "layers"
  ) => {
    if (mode === "single") {
      exportImage(fileName, format, quality);
    } else {
      void exportSelectedLayers(fileName, format, quality, backgroundColor);
    }
  }, [exportImage, exportSelectedLayers]);

  return {
    exportImage,
    exportSelectedLayers,
    handleExportFromModal,
  };
}
