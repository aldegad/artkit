// ============================================
// Snap System Core Logic
// Pure functions for snapping calculations
// ============================================

import type { Point, BoundingBox, UnifiedLayer } from "@/shared/types";
import type {
  SnapSource,
  SnapResult,
  SnapOrientation,
  SnapEdge,
  Guide,
} from "../types";

// ============================================
// Core Snap Functions
// ============================================

/**
 * Find the nearest snap source for a given position
 */
export function findNearestSnapSource(
  position: number,
  orientation: SnapOrientation,
  sources: SnapSource[],
  tolerance: number
): SnapResult {
  const relevantSources = sources.filter((s) => s.orientation === orientation);

  let nearestSource: SnapSource | null = null;
  let nearestDistance = Infinity;
  let nearestPosition = position;

  for (const source of relevantSources) {
    const distance = Math.abs(source.position - position);
    if (distance <= tolerance && distance < nearestDistance) {
      nearestDistance = distance;
      nearestSource = source;
      nearestPosition = source.position;
    }
  }

  return {
    snapped: nearestSource !== null,
    position: nearestPosition,
    source: nearestSource,
    delta: nearestSource ? nearestPosition - position : 0,
  };
}

/**
 * Snap a point to nearby sources
 */
export function snapPoint(
  point: Point,
  sources: SnapSource[],
  tolerance: number
): { x: SnapResult; y: SnapResult } {
  return {
    x: findNearestSnapSource(point.x, "vertical", sources, tolerance),
    y: findNearestSnapSource(point.y, "horizontal", sources, tolerance),
  };
}

/**
 * Snap bounds to nearby sources
 * Returns snapped bounds and information about which edges snapped
 */
export function snapBounds(
  bounds: BoundingBox,
  sources: SnapSource[],
  tolerance: number,
  edges: SnapEdge[] = ["left", "right", "top", "bottom"]
): { bounds: BoundingBox; snappedEdges: SnapResult[] } {
  const snappedEdges: SnapResult[] = [];
  let deltaX = 0;
  let deltaY = 0;

  // Calculate edge positions
  const edgePositions: Record<SnapEdge, { position: number; orientation: SnapOrientation }> = {
    left: { position: bounds.minX, orientation: "vertical" },
    right: { position: bounds.maxX, orientation: "vertical" },
    top: { position: bounds.minY, orientation: "horizontal" },
    bottom: { position: bounds.maxY, orientation: "horizontal" },
    centerX: { position: bounds.minX + bounds.width / 2, orientation: "vertical" },
    centerY: { position: bounds.minY + bounds.height / 2, orientation: "horizontal" },
  };

  // Check each requested edge for snapping
  for (const edge of edges) {
    const { position, orientation } = edgePositions[edge];
    const result = findNearestSnapSource(position, orientation, sources, tolerance);

    if (result.snapped) {
      snappedEdges.push(result);

      // Apply the first snap delta for each axis
      if (orientation === "vertical" && deltaX === 0) {
        deltaX = result.delta;
      } else if (orientation === "horizontal" && deltaY === 0) {
        deltaY = result.delta;
      }
    }
  }

  // Create snapped bounds
  const snappedBounds: BoundingBox = {
    minX: bounds.minX + deltaX,
    minY: bounds.minY + deltaY,
    maxX: bounds.maxX + deltaX,
    maxY: bounds.maxY + deltaY,
    width: bounds.width,
    height: bounds.height,
  };

  return { bounds: snappedBounds, snappedEdges };
}

// ============================================
// Snap Source Collection
// ============================================

export interface CollectSnapSourcesOptions {
  guides?: Guide[];
  canvasSize?: { width: number; height: number };
  includeCanvasEdges?: boolean;
  includeLayerEdges?: boolean;
  layers?: UnifiedLayer[];
  activeLayerId?: string; // Exclude active layer from sources
}

/**
 * Collect snap sources from various inputs
 */
export function collectSnapSources(options: CollectSnapSourcesOptions): SnapSource[] {
  const sources: SnapSource[] = [];

  // Add guides as snap sources
  if (options.guides) {
    for (const guide of options.guides) {
      sources.push({
        type: "guide",
        orientation: guide.orientation,
        position: guide.position,
        id: guide.id,
      });
    }
  }

  // Add canvas edges as snap sources
  if (options.includeCanvasEdges && options.canvasSize) {
    const { width, height } = options.canvasSize;

    // Vertical edges (left/right)
    sources.push(
      { type: "canvas-edge", orientation: "vertical", position: 0, id: "canvas-left" },
      { type: "canvas-edge", orientation: "vertical", position: width, id: "canvas-right" },
      { type: "canvas-edge", orientation: "vertical", position: width / 2, id: "canvas-center-x" }
    );

    // Horizontal edges (top/bottom)
    sources.push(
      { type: "canvas-edge", orientation: "horizontal", position: 0, id: "canvas-top" },
      { type: "canvas-edge", orientation: "horizontal", position: height, id: "canvas-bottom" },
      { type: "canvas-edge", orientation: "horizontal", position: height / 2, id: "canvas-center-y" }
    );
  }

  // Add layer edges as snap sources (excluding active layer)
  if (options.includeLayerEdges && options.layers) {
    for (const layer of options.layers) {
      if (layer.id === options.activeLayerId) continue;
      if (!layer.visible) continue;
      if (!layer.position || !layer.originalSize) continue;

      const { x, y } = layer.position;
      const { width, height } = layer.originalSize;

      // Vertical edges
      sources.push(
        { type: "layer-edge", orientation: "vertical", position: x, id: `layer-${layer.id}-left` },
        { type: "layer-edge", orientation: "vertical", position: x + width, id: `layer-${layer.id}-right` }
      );

      // Horizontal edges
      sources.push(
        { type: "layer-edge", orientation: "horizontal", position: y, id: `layer-${layer.id}-top` },
        { type: "layer-edge", orientation: "horizontal", position: y + height, id: `layer-${layer.id}-bottom` }
      );
    }
  }

  return sources;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Convert a rectangular bounds to a BoundingBox
 */
export function rectToBoundingBox(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): BoundingBox {
  return {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Convert a BoundingBox to a simple rect
 */
export function boundingBoxToRect(bounds: BoundingBox): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.width,
    height: bounds.height,
  };
}

/**
 * Get active snap sources (sources that were snapped to in the last operation)
 * Useful for rendering snap indicator lines
 */
export function getActiveSnapSources(snappedEdges: SnapResult[]): SnapSource[] {
  return snappedEdges
    .filter((edge) => edge.snapped && edge.source !== null)
    .map((edge) => edge.source as SnapSource);
}
