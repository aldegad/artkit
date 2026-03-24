// ============================================
// Layer Types (shared across domains)
// ============================================

import { Point, Size } from "./common";

export type LayerBlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "soft-light"
  | "color"
  | "luminosity";

export type TextLayerAlign = "left" | "center" | "right";
export type TextLayerVerticalAlign = "top" | "middle" | "bottom";

export interface TextLayerData {
  text: string;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textAlign: TextLayerAlign;
  verticalAlign: TextLayerVerticalAlign;
  color: string;
  lineHeight: number;
  letterSpacing: number;
  backgroundColor?: string | null;
  strokeColor?: string;
  strokeWidth?: number;
}

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
  blendMode?: LayerBlendMode;
  zIndex: number; // layer order (higher = on top)

  // Canvas data (base64 encoded)
  paintData?: string;
  alphaMaskData?: string;
  textData?: TextLayerData;

  // Optional transform (for layer positioning within canvas)
  position?: Point; // x, y offset from canvas origin
  scale?: number; // 1 = 100%
  rotation?: number; // degrees (per-layer rotation)
  originalSize?: Size; // original dimensions before any transforms

  /** If set, this layer is clipped by the layer with this id (the layer below in z-order). */
  clippingMaskLayerId?: string | null;
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
    blendMode: "source-over",
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
    blendMode: "source-over",
    zIndex,
    paintData: "",
  };
}
