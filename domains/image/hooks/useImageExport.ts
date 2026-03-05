"use client";

import { useCallback, RefObject } from "react";
import { UnifiedLayer, OutputFormat, CropArea } from "../types";
import { drawLayerWithOptionalAlphaMask } from "@/shared/utils/layerAlphaMask";
import { createSvgBlobFromCanvas } from "@/shared/utils/svgImage";
import { getLayerContentBounds } from "../utils/layerContentBounds";

export type ImageExportMode = "single" | "layers" | "sprite";
export type ImageExportObjectFit = boolean;

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
    backgroundColor: string | null,
    objectFit: ImageExportObjectFit
  ) => Promise<void>;
  handleExportFromModal: (
    fileName: string,
    format: OutputFormat,
    quality: number,
    backgroundColor: string | null,
    mode: ImageExportMode,
    objectFit: ImageExportObjectFit
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
      compositeCtx.globalCompositeOperation = layer.blendMode || "source-over";
      const posX = layer.position?.x || 0;
      const posY = layer.position?.y || 0;
      drawLayerWithOptionalAlphaMask(compositeCtx, layerCanvas, posX, posY);
      compositeCtx.globalAlpha = 1;
      compositeCtx.globalCompositeOperation = "source-over";
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

    const extension = format === "jpeg" ? "jpg" : format;

    if (format === "svg") {
      const blob = createSvgBlobFromCanvas(exportCanvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.${extension}`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const mimeType = format === "webp" ? "image/webp" : format === "jpeg" ? "image/jpeg" : "image/png";

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
    backgroundColor: string | null,
    fitToObject: ImageExportObjectFit
  ) => {
    const targetIds = selectedLayerIds.length > 0 ? selectedLayerIds : (activeLayerId ? [activeLayerId] : []);
    if (targetIds.length === 0) return;

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
    const extension = format === "jpeg" ? "jpg" : format;
    const mimeType = format === "webp" ? "image/webp" : format === "jpeg" ? "image/jpeg" : "image/png";

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    const targetLayers = [...layers]
      .filter((layer) => targetIds.includes(layer.id))
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    const layerEntries = targetLayers
      .map((layer) => {
        const layerCanvas = layerCanvasesRef.current?.get(layer.id);
        if (!layerCanvas) return null;
        return { layer, layerCanvas };
      })
      .filter((entry): entry is { layer: UnifiedLayer; layerCanvas: HTMLCanvasElement } => !!entry);

    if (layerEntries.length === 0) return;

    const blobPromises = layerEntries.map(({ layer, layerCanvas }) => {
      const layerBounds = fitToObject ? getLayerContentBounds(layer, layerCanvas) : null;
      const hasObjectBounds = !!layerBounds && layerBounds.width > 0 && layerBounds.height > 0;

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = hasObjectBounds ? layerBounds.width : displayWidth;
      exportCanvas.height = hasObjectBounds ? layerBounds.height : displayHeight;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) return null;

      if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      } else if (format === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      }

      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = layer.blendMode || "source-over";

      if (hasObjectBounds && layerBounds) {
        const maskedCanvas = document.createElement("canvas");
        maskedCanvas.width = layerCanvas.width;
        maskedCanvas.height = layerCanvas.height;
        const maskedCtx = maskedCanvas.getContext("2d");
        if (!maskedCtx) return null;
        drawLayerWithOptionalAlphaMask(maskedCtx, layerCanvas, 0, 0);

        ctx.drawImage(
          maskedCanvas,
          layerBounds.localX,
          layerBounds.localY,
          layerBounds.width,
          layerBounds.height,
          0,
          0,
          layerBounds.width,
          layerBounds.height,
        );
      } else {
        const posX = layer.position?.x || 0;
        const posY = layer.position?.y || 0;
        drawLayerWithOptionalAlphaMask(ctx, layerCanvas, posX, posY);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (format === "svg") {
        const blob = createSvgBlobFromCanvas(exportCanvas);
        zip.file(`${layer.name || "layer"}.${extension}`, blob);
        return Promise.resolve();
      }

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

  const exportSelectedLayersAsSprite = useCallback((
    fileName: string,
    format: OutputFormat,
    quality: number,
    backgroundColor: string | null,
    fitToObject: ImageExportObjectFit
  ) => {
    const targetIds = selectedLayerIds.length > 0 ? selectedLayerIds : (activeLayerId ? [activeLayerId] : []);
    if (targetIds.length === 0) return;
    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    const targetLayers = [...layers]
      .filter((layer) => targetIds.includes(layer.id))
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    type SpriteFrameEntry = {
      layer: UnifiedLayer;
      layerCanvas: HTMLCanvasElement;
      maskedCanvas: HTMLCanvasElement | null;
      bounds: NonNullable<ReturnType<typeof getLayerContentBounds>> | null;
    };

    const frameEntries: SpriteFrameEntry[] = [];
    for (const layer of targetLayers) {
      const layerCanvas = layerCanvasesRef.current?.get(layer.id);
      if (!layerCanvas) continue;

      if (fitToObject) {
        const bounds = getLayerContentBounds(layer, layerCanvas);
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;

        const maskedCanvas = document.createElement("canvas");
        maskedCanvas.width = layerCanvas.width;
        maskedCanvas.height = layerCanvas.height;
        const maskedCtx = maskedCanvas.getContext("2d");
        if (!maskedCtx) continue;
        drawLayerWithOptionalAlphaMask(maskedCtx, layerCanvas, 0, 0);

        frameEntries.push({ layer, layerCanvas, maskedCanvas, bounds });
        continue;
      }

      frameEntries.push({ layer, layerCanvas, maskedCanvas: null, bounds: null });
    }

    if (frameEntries.length === 0) return;

    const frameWidth = fitToObject
      ? Math.max(...frameEntries.map((entry) => entry.bounds?.width || 0))
      : displayWidth;
    const frameHeight = fitToObject
      ? Math.max(...frameEntries.map((entry) => entry.bounds?.height || 0))
      : displayHeight;
    if (frameWidth <= 0 || frameHeight <= 0) return;

    const columns = Math.max(1, Math.ceil(Math.sqrt(frameEntries.length)));
    const rows = Math.ceil(frameEntries.length / columns);

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = frameWidth * columns;
    exportCanvas.height = frameHeight * rows;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return;

    if (backgroundColor) {
      exportCtx.fillStyle = backgroundColor;
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    } else if (format === "jpeg") {
      exportCtx.fillStyle = "#ffffff";
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }

    frameEntries.forEach((entry, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cellX = col * frameWidth;
      const cellY = row * frameHeight;

      exportCtx.globalAlpha = entry.layer.opacity / 100;
      exportCtx.globalCompositeOperation = entry.layer.blendMode || "source-over";

      if (fitToObject && entry.maskedCanvas && entry.bounds) {
        const destX = cellX + Math.floor((frameWidth - entry.bounds.width) / 2);
        const destY = cellY + Math.floor((frameHeight - entry.bounds.height) / 2);
        exportCtx.drawImage(
          entry.maskedCanvas,
          entry.bounds.localX,
          entry.bounds.localY,
          entry.bounds.width,
          entry.bounds.height,
          destX,
          destY,
          entry.bounds.width,
          entry.bounds.height,
        );
      } else {
        const posX = entry.layer.position?.x || 0;
        const posY = entry.layer.position?.y || 0;
        drawLayerWithOptionalAlphaMask(exportCtx, entry.layerCanvas, cellX + posX, cellY + posY);
      }

      exportCtx.globalAlpha = 1;
      exportCtx.globalCompositeOperation = "source-over";
    });

    const extension = format === "jpeg" ? "jpg" : format;

    if (format === "svg") {
      const blob = createSvgBlobFromCanvas(exportCanvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.${extension}`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const mimeType = format === "webp" ? "image/webp" : format === "jpeg" ? "image/jpeg" : "image/png";

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
  }, [layers, selectedLayerIds, activeLayerId, layerCanvasesRef, getDisplayDimensions]);

  const handleExportFromModal = useCallback((
    fileName: string,
    format: OutputFormat,
    quality: number,
    backgroundColor: string | null,
    mode: ImageExportMode,
    fitToObject: ImageExportObjectFit
  ) => {
    if (mode === "single") {
      exportImage(fileName, format, quality);
      return;
    }
    if (mode === "layers") {
      void exportSelectedLayers(fileName, format, quality, backgroundColor, fitToObject);
      return;
    }
    exportSelectedLayersAsSprite(fileName, format, quality, backgroundColor, fitToObject);
  }, [exportImage, exportSelectedLayers, exportSelectedLayersAsSprite]);

  return {
    exportImage,
    exportSelectedLayers,
    handleExportFromModal,
  };
}
