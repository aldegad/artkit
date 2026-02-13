import { UnifiedLayer } from "@/shared/types";

const THUMBNAIL_SIZE = 144;

/**
 * Load image from base64 data URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Generate a 144x144 thumbnail from layer data (base64)
 * - Merges all visible layers in zIndex order
 * - Fits image into 144x144 square with "contain" mode
 * - Preserves transparency (PNG)
 */
export async function generateThumbnailFromLayers(
  layers: UnifiedLayer[],
  canvasSize: { width: number; height: number }
): Promise<string> {
  const { width, height } = canvasSize;

  // Create merged canvas with original size
  const mergedCanvas = document.createElement("canvas");
  mergedCanvas.width = width;
  mergedCanvas.height = height;
  const mergedCtx = mergedCanvas.getContext("2d");

  if (!mergedCtx) {
    throw new Error("Failed to create canvas context");
  }

  // Sort and filter visible layers with paintData
  const sortedLayers = [...layers]
    .filter((layer) => layer.visible && layer.paintData)
    .sort((a, b) => a.zIndex - b.zIndex);

  // Load and draw each layer
  for (const layer of sortedLayers) {
    if (!layer.paintData) continue;

    try {
      const img = await loadImage(layer.paintData);
      mergedCtx.globalAlpha = layer.opacity / 100;
      mergedCtx.globalCompositeOperation = layer.blendMode || "source-over";
      const posX = layer.position?.x || 0;
      const posY = layer.position?.y || 0;
      mergedCtx.drawImage(img, posX, posY);
      mergedCtx.globalAlpha = 1;
      mergedCtx.globalCompositeOperation = "source-over";
    } catch (error) {
      console.warn(`Failed to load layer ${layer.id}:`, error);
    }
  }

  // Create thumbnail canvas with contain fit
  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = THUMBNAIL_SIZE;
  thumbnailCanvas.height = THUMBNAIL_SIZE;
  const thumbCtx = thumbnailCanvas.getContext("2d");

  if (!thumbCtx) {
    throw new Error("Failed to create thumbnail context");
  }

  // Calculate "contain" fit dimensions
  const scale = Math.min(THUMBNAIL_SIZE / width, THUMBNAIL_SIZE / height);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const offsetX = (THUMBNAIL_SIZE - scaledWidth) / 2;
  const offsetY = (THUMBNAIL_SIZE - scaledHeight) / 2;

  // Draw with high quality scaling, preserving transparency
  thumbCtx.imageSmoothingEnabled = true;
  thumbCtx.imageSmoothingQuality = "high";
  thumbCtx.drawImage(mergedCanvas, offsetX, offsetY, scaledWidth, scaledHeight);

  // Return as base64 PNG (preserves transparency)
  return thumbnailCanvas.toDataURL("image/png");
}
