// ============================================
// Layer Types (shared across domains)
// ============================================

import { Point, Size } from "./common";

/**
 * UnifiedLayer: All layers are pixel-based (paint layers)
 * Images imported are drawn onto the layer canvas
 *
 * Used by both sprite editor and image editor
 */
export interface UnifiedLayer {
  id: string;
  name: string;
  type: "paint"; // All layers are paint layers now
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-100
  zIndex: number; // layer order (higher = on top)

  // Canvas data (base64 encoded)
  paintData?: string;
  alphaMaskData?: string;

  // Optional transform (for layer positioning within canvas)
  position?: Point; // x, y offset from canvas origin
  scale?: number; // 1 = 100%
  rotation?: number; // degrees (per-layer rotation)
  originalSize?: Size; // original dimensions before any transforms
}

/**
 * Create a new paint layer with original size info
 * Use this when importing an image - caller should draw image to canvas and set paintData
 */
export function createLayerWithSize(
  name: string,
  originalSize: Size,
  zIndex: number
): UnifiedLayer {
  return {
    id: crypto.randomUUID(),
    name,
    type: "paint",
    visible: true,
    locked: false,
    opacity: 100,
    zIndex,
    position: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    originalSize,
  };
}

/**
 * Create a new paint layer for brush strokes
 */
export function createPaintLayer(name: string, zIndex: number): UnifiedLayer {
  return {
    id: crypto.randomUUID(),
    name,
    type: "paint",
    visible: true,
    locked: false,
    opacity: 100,
    zIndex,
    paintData: "",
  };
}
