// ============================================
// Canvas Utility Functions
// ============================================

import { Point } from "../types";

/**
 * Calculate bounding box from an array of points
 */
export function getBoundingBox(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
