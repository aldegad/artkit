import { Point, BoundingBox } from "../types";

// ============================================
// Coordinate Transformation
// ============================================

export interface TransformParams {
  scale: number;
  zoom: number;
  pan: Point;
}

/**
 * 화면 좌표를 원본 이미지 좌표로 변환
 */
export const screenToImage = (
  screenX: number,
  screenY: number,
  canvasRect: DOMRect,
  transform: TransformParams,
): Point => {
  const { scale, zoom, pan } = transform;
  const x = (screenX - canvasRect.left - pan.x) / (scale * zoom);
  const y = (screenY - canvasRect.top - pan.y) / (scale * zoom);
  return { x: Math.round(x), y: Math.round(y) };
};

/**
 * 원본 이미지 좌표를 화면 좌표로 변환
 */
export const imageToScreen = (imgX: number, imgY: number, transform: TransformParams): Point => {
  const { scale, zoom, pan } = transform;
  return {
    x: imgX * scale * zoom + pan.x,
    y: imgY * scale * zoom + pan.y,
  };
};

// ============================================
// Bounding Box
// ============================================

/**
 * 폴리곤 bounding box 계산
 */
export const getBoundingBox = (points: Point[]): BoundingBox => {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

// ============================================
// Point-in-Polygon
// ============================================

/**
 * 점이 폴리곤 안에 있는지 확인 (Ray casting algorithm)
 */
export const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;

    if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

// ============================================
// Distance & Proximity
// ============================================

/**
 * 두 점 사이의 거리 계산
 */
export const getDistance = (p1: Point, p2: Point): number => {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
};

/**
 * 두 점이 threshold 이내에 있는지 확인
 */
export const isNearPoint = (p1: Point, p2: Point, threshold: number = 10): boolean => {
  return getDistance(p1, p2) < threshold;
};

/**
 * 화면 좌표 기준으로 두 이미지 좌표가 가까운지 확인
 */
export const isNearPointOnScreen = (
  imgPoint1: Point,
  imgPoint2: Point,
  transform: TransformParams,
  threshold: number = 10,
): boolean => {
  const screen1 = imageToScreen(imgPoint1.x, imgPoint1.y, transform);
  const screen2 = imageToScreen(imgPoint2.x, imgPoint2.y, transform);
  return getDistance(screen1, screen2) < threshold;
};

// ============================================
// Polygon Utilities
// ============================================

/**
 * 폴리곤의 중심점 계산
 */
export const getPolygonCenter = (points: Point[]): Point => {
  if (points.length === 0) return { x: 0, y: 0 };

  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
};

/**
 * 폴리곤 이동
 */
export const translatePolygon = (points: Point[], dx: number, dy: number): Point[] => {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
};

/**
 * 점 이동
 */
export const translatePoint = (point: Point, dx: number, dy: number): Point => {
  return { x: point.x + dx, y: point.y + dy };
};
