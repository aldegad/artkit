"use client";

// ============================================
// useCoordinateTransform Hook
// ============================================
//
// EditorStateContext와 EditorRefsContext에서 필요한 정보를 가져와
// 좌표 변환 함수들을 제공하는 React 훅
//

import { useCallback, useMemo } from "react";
import { Point, Size } from "@/shared/types";
import { UnifiedLayer } from "../types";
import { useEditorState, useEditorRefs } from "../contexts";
import {
  ViewContext,
  LayerContext,
  getDisplayDimensions,
  calculateViewOffset,
  screenToCanvas,
  canvasToImage,
  imageToCanvas,
  imageToLayer,
  layerToImage,
  isInImageBounds,
  clampToSize,
  Bounds,
  imageBoundsToLayer,
  layerBoundsToImage,
  imageBoundsToCanvas,
} from "../utils/coordinateSystem";

// ============================================
// Types
// ============================================

export interface UseCoordinateTransformOptions {
  /** 활성 레이어 (선택적) */
  activeLayer?: UnifiedLayer | null;
}

export interface UseCoordinateTransformReturn {
  // 컨텍스트
  viewContext: ViewContext;
  layerContext: LayerContext | null;
  displaySize: Size;
  viewOffset: Point;

  // 단일 좌표 변환 함수
  getMousePos: (e: React.MouseEvent | React.PointerEvent | PointerEvent | MouseEvent) => Point;
  screenToImage: (canvasPos: Point) => Point;
  imageToScreen: (imagePos: Point) => Point;
  imageToLayer: (imagePos: Point) => Point;
  layerToImage: (layerPos: Point) => Point;
  screenToLayer: (canvasPos: Point) => Point;

  // 바운드 변환 함수
  imageBoundsToLayer: (bounds: Bounds) => Bounds;
  layerBoundsToImage: (bounds: Bounds) => Bounds;
  imageBoundsToScreen: (bounds: Bounds) => Bounds;

  // 유틸리티
  isInBounds: (imagePos: Point) => boolean;
  clampToImage: (imagePos: Point) => Point;
}

// ============================================
// Hook Implementation
// ============================================

export function useCoordinateTransform(
  options: UseCoordinateTransformOptions = {}
): UseCoordinateTransformReturn {
  const { activeLayer } = options;

  // Context에서 상태 가져오기
  const {
    state: { zoom, pan, rotation, canvasSize },
  } = useEditorState();

  const { canvasRef } = useEditorRefs();

  // 디스플레이 크기 계산 (memoized)
  const displaySize = useMemo(
    () => getDisplayDimensions(canvasSize, rotation),
    [canvasSize, rotation]
  );

  // 뷰 컨텍스트 (memoized)
  const viewContext = useMemo<ViewContext>(() => ({
    canvasSize: {
      width: canvasRef.current?.width || canvasSize.width,
      height: canvasRef.current?.height || canvasSize.height,
    },
    displaySize,
    zoom,
    pan,
  }), [canvasRef, canvasSize, displaySize, zoom, pan]);

  // 레이어 컨텍스트 (memoized)
  const layerContext = useMemo<LayerContext | null>(() => {
    if (!activeLayer) return null;
    return {
      position: activeLayer.position || { x: 0, y: 0 },
    };
  }, [activeLayer]);

  // 뷰 오프셋 (memoized)
  const viewOffset = useMemo(
    () => calculateViewOffset(viewContext),
    [viewContext]
  );

  // ============================================
  // 좌표 변환 함수들
  // ============================================

  /**
   * 마우스 이벤트에서 캔버스 좌표 추출
   */
  const getMousePos = useCallback(
    (e: React.MouseEvent | React.PointerEvent | PointerEvent | MouseEvent): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      return screenToCanvas(
        { x: e.clientX, y: e.clientY },
        rect,
        { width: canvas.width, height: canvas.height }
      );
    },
    [canvasRef]
  );

  /**
   * Canvas -> Image (zoom/pan 역변환)
   */
  const screenToImageFn = useCallback(
    (canvasPos: Point): Point => {
      return canvasToImage(canvasPos, viewContext);
    },
    [viewContext]
  );

  /**
   * Image -> Canvas (zoom/pan 적용)
   */
  const imageToScreenFn = useCallback(
    (imagePos: Point): Point => {
      return imageToCanvas(imagePos, viewContext);
    },
    [viewContext]
  );

  /**
   * Image -> Layer (레이어 오프셋 적용)
   */
  const imageToLayerFn = useCallback(
    (imagePos: Point): Point => {
      if (!layerContext) return imagePos;
      return imageToLayer(imagePos, layerContext);
    },
    [layerContext]
  );

  /**
   * Layer -> Image (레이어 오프셋 역적용)
   */
  const layerToImageFn = useCallback(
    (layerPos: Point): Point => {
      if (!layerContext) return layerPos;
      return layerToImage(layerPos, layerContext);
    },
    [layerContext]
  );

  /**
   * Canvas -> Layer (복합 변환)
   */
  const screenToLayerFn = useCallback(
    (canvasPos: Point): Point => {
      const imagePos = screenToImageFn(canvasPos);
      return imageToLayerFn(imagePos);
    },
    [screenToImageFn, imageToLayerFn]
  );

  // ============================================
  // 바운드 변환 함수들
  // ============================================

  const imageBoundsToLayerFn = useCallback(
    (bounds: Bounds): Bounds => {
      if (!layerContext) return bounds;
      return imageBoundsToLayer(bounds, layerContext);
    },
    [layerContext]
  );

  const layerBoundsToImageFn = useCallback(
    (bounds: Bounds): Bounds => {
      if (!layerContext) return bounds;
      return layerBoundsToImage(bounds, layerContext);
    },
    [layerContext]
  );

  const imageBoundsToScreenFn = useCallback(
    (bounds: Bounds): Bounds => {
      return imageBoundsToCanvas(bounds, viewContext);
    },
    [viewContext]
  );

  // ============================================
  // 유틸리티 함수
  // ============================================

  const isInBounds = useCallback(
    (imagePos: Point): boolean => {
      return isInImageBounds(imagePos, displaySize);
    },
    [displaySize]
  );

  const clampToImage = useCallback(
    (imagePos: Point): Point => {
      return clampToSize(imagePos, displaySize);
    },
    [displaySize]
  );

  return {
    viewContext,
    layerContext,
    displaySize,
    viewOffset,
    getMousePos,
    screenToImage: screenToImageFn,
    imageToScreen: imageToScreenFn,
    imageToLayer: imageToLayerFn,
    layerToImage: layerToImageFn,
    screenToLayer: screenToLayerFn,
    imageBoundsToLayer: imageBoundsToLayerFn,
    layerBoundsToImage: layerBoundsToImageFn,
    imageBoundsToScreen: imageBoundsToScreenFn,
    isInBounds,
    clampToImage,
  };
}
