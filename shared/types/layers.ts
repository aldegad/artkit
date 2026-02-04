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

// ============================================
// Legacy types (kept for backward compatibility during migration)
// ============================================

/**
 * @deprecated Use UnifiedLayer instead
 * CompositionLayer: For compositing multiple images together
 */
export interface CompositionLayer {
  id: string;
  name: string;
  imageSrc: string; // base64 or URL of the image
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-100
  position: Point; // x, y offset from canvas origin
  scale: number; // 1 = 100%
  rotation: number; // degrees
  zIndex: number; // layer order (higher = on top)
  originalSize: Size; // original image dimensions
}

/**
 * @deprecated Use UnifiedLayer instead
 * ImageLayer: For paint/edit operations on canvas
 */
export interface ImageLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0-100
  data: string; // base64 encoded canvas data
}

// ============================================
// Migration helpers
// ============================================

/**
 * Convert legacy CompositionLayer to UnifiedLayer
 * Note: The caller should draw the image to canvas and set paintData
 */
export function compositionLayerToUnified(layer: CompositionLayer): UnifiedLayer {
  return {
    id: layer.id,
    name: layer.name,
    type: "paint",
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    zIndex: layer.zIndex,
    position: layer.position,
    scale: layer.scale,
    rotation: layer.rotation,
    originalSize: layer.originalSize,
  };
}

/**
 * Convert legacy ImageLayer to UnifiedLayer
 */
export function imageLayerToUnified(layer: ImageLayer, zIndex: number): UnifiedLayer {
  return {
    id: layer.id,
    name: layer.name,
    type: "paint",
    visible: layer.visible,
    locked: false,
    opacity: layer.opacity,
    zIndex,
    paintData: layer.data,
  };
}
