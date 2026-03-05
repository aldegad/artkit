"use client";

import { UnifiedLayer } from "../types";
import { drawLayerWithOptionalAlphaMask } from "@/shared/utils/layerAlphaMask";

export interface LayerContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  localX: number;
  localY: number;
}

// Ignore near-zero alpha noise when computing transform/content bounds.
// This keeps bounds tight after heavy erasing without affecting actual render alpha.
const CONTENT_BOUNDS_ALPHA_THRESHOLD = 8;

function getCanvasContentBounds(canvas: HTMLCanvasElement): LayerContentBounds | null {
  const maskAwareCanvas = document.createElement("canvas");
  maskAwareCanvas.width = canvas.width;
  maskAwareCanvas.height = canvas.height;
  const maskAwareCtx = maskAwareCanvas.getContext("2d");
  if (!maskAwareCtx) return null;

  drawLayerWithOptionalAlphaMask(maskAwareCtx, canvas, 0, 0);
  const imageData = maskAwareCtx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  let hasContent = false;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = imageData.data[(y * canvas.width + x) * 4 + 3];
      if (alpha >= CONTENT_BOUNDS_ALPHA_THRESHOLD) {
        hasContent = true;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (!hasContent) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      localX: 0,
      localY: 0,
    };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    localX: minX,
    localY: minY,
  };
}

export function getLayerContentBounds(
  layer: Pick<UnifiedLayer, "position">,
  layerCanvas?: HTMLCanvasElement | null
): LayerContentBounds | null {
  const layerPosX = layer.position?.x || 0;
  const layerPosY = layer.position?.y || 0;

  if (!layerCanvas) {
    return {
      x: layerPosX,
      y: layerPosY,
      width: 0,
      height: 0,
      localX: 0,
      localY: 0,
    };
  }

  const localBounds = getCanvasContentBounds(layerCanvas);
  if (!localBounds) return null;

  return {
    x: layerPosX + localBounds.localX,
    y: layerPosY + localBounds.localY,
    width: localBounds.width,
    height: localBounds.height,
    localX: localBounds.localX,
    localY: localBounds.localY,
  };
}
