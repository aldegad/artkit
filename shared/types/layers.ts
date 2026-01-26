// ============================================
// Layer Types (shared across domains)
// ============================================

import { Point, Size } from "./common";

/**
 * UnifiedLayer: Single layer type that can hold both image and paint data
 * Similar to Photoshop layers - each layer can be an image layer OR a paint layer
 *
 * Used by both sprite editor and image editor
 */
export interface UnifiedLayer {
  id: string;
  name: string;
  type: "image" | "paint"; // image = imported image, paint = brush strokes
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-100
  zIndex: number; // layer order (higher = on top)

  // For image layers (type === "image")
  imageSrc?: string; // base64 or URL of the image
  position?: Point; // x, y offset from canvas origin
  scale?: number; // 1 = 100%
  rotation?: number; // degrees (per-layer rotation)
  originalSize?: Size; // original image dimensions

  // For paint layers (type === "paint")
  paintData?: string; // base64 encoded canvas data for brush strokes
}

/**
 * Create a new image layer from an image source
 */
export function createImageLayer(
  imageSrc: string,
  name: string,
  originalSize: Size,
  zIndex: number
): UnifiedLayer {
  return {
    id: crypto.randomUUID(),
    name,
    type: "image",
    visible: true,
    locked: false,
    opacity: 100,
    zIndex,
    imageSrc,
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
 */
export function compositionLayerToUnified(layer: CompositionLayer): UnifiedLayer {
  return {
    id: layer.id,
    name: layer.name,
    type: "image",
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    zIndex: layer.zIndex,
    imageSrc: layer.imageSrc,
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
