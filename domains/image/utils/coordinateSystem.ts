// ============================================
// Coordinate System Utilities
// ============================================
//
// 에디터의 좌표 변환을 위한 유틸리티 함수들
//
// 좌표 시스템 계층:
// 1. Screen Coords - 브라우저 픽셀 (clientX/Y)
// 2. Canvas Display Coords - 캔버스 DOM 내부 좌표 (DPI 보정됨)
// 3. Image Coords - 이미지 논리 좌표 (zoom/pan 적용 전)
// 4. Layer-Local Coords - 레이어 캔버스 내 좌표
//

import { Point, Size } from "@/shared/types";

// ============================================
// Types
// ============================================

/**
 * 좌표 변환에 필요한 뷰 컨텍스트
 */
export interface ViewContext {
  canvasSize: Size;      // 캔버스 DOM 크기
  displaySize: Size;     // 이미지 디스플레이 크기 (rotation 적용됨)
  zoom: number;
  pan: Point;
}

/**
 * 레이어 좌표 변환 컨텍스트
 */
export interface LayerContext {
  position: Point;       // 레이어 오프셋
}

// ============================================
// Display Dimensions
// ============================================

/**
 * 회전 적용된 디스플레이 크기 계산
 * rotation이 90 또는 270도면 width/height를 교환
 */
export function getDisplayDimensions(
  canvasSize: Size,
  rotation: number
): Size {
  const isRotated = rotation % 180 !== 0;
  return {
    width: isRotated ? canvasSize.height : canvasSize.width,
    height: isRotated ? canvasSize.width : canvasSize.height,
  };
}

// ============================================
// View Offset Calculation
// ============================================

/**
 * 뷰 오프셋 계산 (캔버스 중앙 정렬 + pan)
 * 이미지가 캔버스 중앙에 위치할 때의 오프셋
 *
 * 이 함수는 기존에 여러 곳에서 중복되던 계산을 통합:
 * - useCanvasInput.ts
 * - useCanvasRendering.ts
 * - useBrushTool.ts
 */
export function calculateViewOffset(ctx: ViewContext): Point {
  const { canvasSize, displaySize, zoom, pan } = ctx;
  const scaledWidth = displaySize.width * zoom;
  const scaledHeight = displaySize.height * zoom;

  return {
    x: (canvasSize.width - scaledWidth) / 2 + pan.x,
    y: (canvasSize.height - scaledHeight) / 2 + pan.y,
  };
}

// ============================================
// Screen <-> Canvas Coordinate Transform
// ============================================

/**
 * Screen -> Canvas (DPI 보정)
 * 브라우저 이벤트 좌표를 캔버스 내부 좌표로 변환
 */
export function screenToCanvas(
  screenPos: Point,
  canvasRect: DOMRect,
  canvasSize: Size
): Point {
  const scaleX = canvasSize.width / canvasRect.width;
  const scaleY = canvasSize.height / canvasRect.height;

  return {
    x: (screenPos.x - canvasRect.left) * scaleX,
    y: (screenPos.y - canvasRect.top) * scaleY,
  };
}

// ============================================
// Canvas <-> Image Coordinate Transform
// ============================================

/**
 * Canvas -> Image (zoom/pan 역변환)
 * 캔버스 좌표를 이미지 논리 좌표로 변환
 */
export function canvasToImage(
  canvasPos: Point,
  ctx: ViewContext
): Point {
  const offset = calculateViewOffset(ctx);

  return {
    x: (canvasPos.x - offset.x) / ctx.zoom,
    y: (canvasPos.y - offset.y) / ctx.zoom,
  };
}

/**
 * Image -> Canvas (zoom/pan 적용)
 * 이미지 좌표를 캔버스 렌더링 좌표로 변환
 */
export function imageToCanvas(
  imagePos: Point,
  ctx: ViewContext
): Point {
  const offset = calculateViewOffset(ctx);

  return {
    x: offset.x + imagePos.x * ctx.zoom,
    y: offset.y + imagePos.y * ctx.zoom,
  };
}

// ============================================
// Image <-> Layer Coordinate Transform
// ============================================

/**
 * Image -> Layer (레이어 오프셋 적용)
 * 이미지 좌표를 레이어 로컬 좌표로 변환
 */
export function imageToLayer(
  imagePos: Point,
  layerCtx: LayerContext
): Point {
  return {
    x: imagePos.x - layerCtx.position.x,
    y: imagePos.y - layerCtx.position.y,
  };
}

/**
 * Layer -> Image (레이어 오프셋 역적용)
 * 레이어 로컬 좌표를 이미지 좌표로 변환
 */
export function layerToImage(
  layerPos: Point,
  layerCtx: LayerContext
): Point {
  return {
    x: layerPos.x + layerCtx.position.x,
    y: layerPos.y + layerCtx.position.y,
  };
}

// ============================================
// Composite Transform Functions
// ============================================

/**
 * Screen -> Image (일반적인 마우스 이벤트 처리용)
 */
export function screenToImage(
  screenPos: Point,
  canvasRect: DOMRect,
  canvasSize: Size,
  ctx: ViewContext
): Point {
  const canvasPos = screenToCanvas(screenPos, canvasRect, canvasSize);
  return canvasToImage(canvasPos, ctx);
}

/**
 * Screen -> Layer (브러시 드로잉용)
 */
export function screenToLayer(
  screenPos: Point,
  canvasRect: DOMRect,
  canvasSize: Size,
  ctx: ViewContext,
  layerCtx: LayerContext
): Point {
  const imagePos = screenToImage(screenPos, canvasRect, canvasSize, ctx);
  return imageToLayer(imagePos, layerCtx);
}

/**
 * Layer -> Canvas (레이어 내용 렌더링용)
 */
export function layerToCanvas(
  layerPos: Point,
  ctx: ViewContext,
  layerCtx: LayerContext
): Point {
  const imagePos = layerToImage(layerPos, layerCtx);
  return imageToCanvas(imagePos, ctx);
}

// ============================================
// Bounds Transform
// ============================================

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 바운딩 박스를 이미지 좌표에서 레이어 좌표로 변환
 */
export function imageBoundsToLayer(
  bounds: Bounds,
  layerCtx: LayerContext
): Bounds {
  return {
    x: bounds.x - layerCtx.position.x,
    y: bounds.y - layerCtx.position.y,
    width: bounds.width,
    height: bounds.height,
  };
}

/**
 * 바운딩 박스를 레이어 좌표에서 이미지 좌표로 변환
 */
export function layerBoundsToImage(
  bounds: Bounds,
  layerCtx: LayerContext
): Bounds {
  return {
    x: bounds.x + layerCtx.position.x,
    y: bounds.y + layerCtx.position.y,
    width: bounds.width,
    height: bounds.height,
  };
}

/**
 * 바운딩 박스를 이미지 좌표에서 캔버스 좌표로 변환
 */
export function imageBoundsToCanvas(
  bounds: Bounds,
  ctx: ViewContext
): Bounds {
  const topLeft = imageToCanvas({ x: bounds.x, y: bounds.y }, ctx);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bounds.width * ctx.zoom,
    height: bounds.height * ctx.zoom,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * 포인트가 이미지 영역 내에 있는지 확인
 */
export function isInImageBounds(
  imagePos: Point,
  displaySize: Size
): boolean {
  return (
    imagePos.x >= 0 &&
    imagePos.x <= displaySize.width &&
    imagePos.y >= 0 &&
    imagePos.y <= displaySize.height
  );
}

/**
 * 포인트가 레이어 영역 내에 있는지 확인
 */
export function isInLayerBounds(
  layerPos: Point,
  layerSize: Size
): boolean {
  return (
    layerPos.x >= 0 &&
    layerPos.x <= layerSize.width &&
    layerPos.y >= 0 &&
    layerPos.y <= layerSize.height
  );
}

/**
 * 좌표를 영역 내로 클램프
 */
export function clampToSize(point: Point, size: Size): Point {
  return {
    x: Math.max(0, Math.min(point.x, size.width)),
    y: Math.max(0, Math.min(point.y, size.height)),
  };
}

/**
 * 바운딩 박스를 영역 내로 클램프
 */
export function clampBoundsToSize(bounds: Bounds, size: Size): Bounds {
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const maxWidth = size.width - x;
  const maxHeight = size.height - y;

  return {
    x,
    y,
    width: Math.min(bounds.width, maxWidth),
    height: Math.min(bounds.height, maxHeight),
  };
}
