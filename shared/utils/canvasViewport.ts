import { Point, Size } from "../types";

// ============================================
// Types
// ============================================

export interface ViewportConfig {
  minZoom: number;
  maxZoom: number;
  wheelZoomFactor: number; // e.g. 0.03 = 3% per tick
  origin: "center" | "topLeft";
}

export interface ViewportTransform {
  zoom: number;
  pan: Point;
  baseScale: number;
}

export const DEFAULT_VIEWPORT_CONFIG: ViewportConfig = {
  minZoom: 0.1,
  maxZoom: 10,
  wheelZoomFactor: 0.03,
  origin: "center",
};

// ============================================
// Coordinate Transforms
// ============================================

/**
 * Screen (clientX/Y) -> Content (image/project) coordinates.
 * DPI-aware: converts CSS pixels to canvas pixels internally.
 */
export function screenToContent(
  screenPos: Point,
  canvasRect: DOMRect,
  canvasPixelSize: Size,
  transform: ViewportTransform,
  contentSize: Size,
  origin: "center" | "topLeft",
): Point {
  const scaleX = canvasPixelSize.width / canvasRect.width;
  const scaleY = canvasPixelSize.height / canvasRect.height;
  const canvasX = (screenPos.x - canvasRect.left) * scaleX;
  const canvasY = (screenPos.y - canvasRect.top) * scaleY;

  const effectiveScale = transform.baseScale * transform.zoom;

  if (origin === "center") {
    const offsetX =
      (canvasPixelSize.width - contentSize.width * effectiveScale) / 2 +
      transform.pan.x;
    const offsetY =
      (canvasPixelSize.height - contentSize.height * effectiveScale) / 2 +
      transform.pan.y;
    return {
      x: (canvasX - offsetX) / effectiveScale,
      y: (canvasY - offsetY) / effectiveScale,
    };
  } else {
    return {
      x: (canvasX - transform.pan.x) / effectiveScale,
      y: (canvasY - transform.pan.y) / effectiveScale,
    };
  }
}

/**
 * Content (image/project) -> Canvas pixel coordinates.
 */
export function contentToCanvas(
  contentPos: Point,
  canvasPixelSize: Size,
  transform: ViewportTransform,
  contentSize: Size,
  origin: "center" | "topLeft",
): Point {
  const effectiveScale = transform.baseScale * transform.zoom;

  if (origin === "center") {
    const offsetX =
      (canvasPixelSize.width - contentSize.width * effectiveScale) / 2 +
      transform.pan.x;
    const offsetY =
      (canvasPixelSize.height - contentSize.height * effectiveScale) / 2 +
      transform.pan.y;
    return {
      x: offsetX + contentPos.x * effectiveScale,
      y: offsetY + contentPos.y * effectiveScale,
    };
  } else {
    return {
      x: transform.pan.x + contentPos.x * effectiveScale,
      y: transform.pan.y + contentPos.y * effectiveScale,
    };
  }
}

/**
 * Calculate render offset for drawing content on canvas.
 */
export function calculateRenderOffset(
  canvasPixelSize: Size,
  contentSize: Size,
  transform: ViewportTransform,
  origin: "center" | "topLeft",
): Point {
  const effectiveScale = transform.baseScale * transform.zoom;
  if (origin === "center") {
    return {
      x:
        (canvasPixelSize.width - contentSize.width * effectiveScale) / 2 +
        transform.pan.x,
      y:
        (canvasPixelSize.height - contentSize.height * effectiveScale) / 2 +
        transform.pan.y,
    };
  } else {
    return { x: transform.pan.x, y: transform.pan.y };
  }
}

/**
 * Cursor-centered zoom calculation.
 * cursorCanvasPos: cursor position in canvas pixels (DPI-corrected).
 */
export function zoomAtPoint(
  cursorCanvasPos: Point,
  currentTransform: ViewportTransform,
  newZoom: number,
  origin: "center" | "topLeft",
  canvasPixelSize: Size,
): { zoom: number; pan: Point } {
  const oldEffective = currentTransform.baseScale * currentTransform.zoom;
  const newEffective = currentTransform.baseScale * newZoom;

  if (origin === "center") {
    const centerX = canvasPixelSize.width / 2;
    const centerY = canvasPixelSize.height / 2;
    const scale = newEffective / oldEffective;
    return {
      zoom: newZoom,
      pan: {
        x:
          currentTransform.pan.x * scale +
          (1 - scale) * (cursorCanvasPos.x - centerX),
        y:
          currentTransform.pan.y * scale +
          (1 - scale) * (cursorCanvasPos.y - centerY),
      },
    };
  } else {
    const contentX =
      (cursorCanvasPos.x - currentTransform.pan.x) / oldEffective;
    const contentY =
      (cursorCanvasPos.y - currentTransform.pan.y) / oldEffective;
    return {
      zoom: newZoom,
      pan: {
        x: cursorCanvasPos.x - contentX * newEffective,
        y: cursorCanvasPos.y - contentY * newEffective,
      },
    };
  }
}

/**
 * Clamp zoom to bounds.
 */
export function clampZoom(
  zoom: number,
  minZoom: number,
  maxZoom: number,
): number {
  return Math.max(minZoom, Math.min(maxZoom, zoom));
}

/**
 * Calculate baseScale to fit content in container.
 */
export function calculateFitScale(
  containerSize: Size,
  contentSize: Size,
  padding: number = 0,
  maxScale: number = 1,
): number {
  if (contentSize.width === 0 || contentSize.height === 0) return 1;
  const availW = containerSize.width - padding * 2;
  const availH = containerSize.height - padding * 2;
  return Math.min(availW / contentSize.width, availH / contentSize.height, maxScale);
}

/**
 * Convert CSS screen position to canvas pixel position (DPI-aware).
 */
export function screenToCanvasPixel(
  screenPos: Point,
  canvasRect: DOMRect,
  canvasPixelSize: Size,
): Point {
  const scaleX = canvasPixelSize.width / canvasRect.width;
  const scaleY = canvasPixelSize.height / canvasRect.height;
  return {
    x: (screenPos.x - canvasRect.left) * scaleX,
    y: (screenPos.y - canvasRect.top) * scaleY,
  };
}

/**
 * Get touch distance for pinch zoom.
 */
export function getTouchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get touch center in canvas pixels.
 */
export function getTouchCenter(
  touches: TouchList,
  canvasRect: DOMRect,
  canvasPixelSize: Size,
): Point {
  const centerX = (touches[0].clientX + touches[1].clientX) / 2;
  const centerY = (touches[0].clientY + touches[1].clientY) / 2;
  return screenToCanvasPixel(
    { x: centerX, y: centerY },
    canvasRect,
    canvasPixelSize,
  );
}
