import { useCallback } from "react";
import { Point, SpriteFrame } from "../../types";
import { getBoundingBox } from "../../utils/geometry";
import { extractPolygonImage } from "../../utils/canvas";

interface UsePenToolOptions {
  currentPoints: Point[];
  setCurrentPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  setFrames: React.Dispatch<React.SetStateAction<SpriteFrame[]>>;
  nextFrameId: number;
  setNextFrameId: React.Dispatch<React.SetStateAction<number>>;
  imageRef: React.RefObject<HTMLImageElement | null>;
}

interface UsePenToolReturn {
  // State
  currentPoints: Point[];
  hasMinimumPoints: boolean;
  canComplete: boolean;

  // Actions
  addPoint: (point: Point) => void;
  completeFrame: () => void;
  cancelPolygon: () => void;
  undoLastPoint: () => void;
  clearPoints: () => void;
}

/**
 * 펜 툴 로직을 관리하는 훅
 */
export function usePenTool({
  currentPoints,
  setCurrentPoints,
  setFrames,
  nextFrameId,
  setNextFrameId,
  imageRef,
}: UsePenToolOptions): UsePenToolReturn {
  const hasMinimumPoints = currentPoints.length >= 3;
  const canComplete = hasMinimumPoints;

  /**
   * 이미지에서 폴리곤 영역 추출
   */
  const extractFrameImage = useCallback(
    (points: Point[]): string | undefined => {
      if (!imageRef.current || points.length < 3) return undefined;

      const bbox = getBoundingBox(points);
      return extractPolygonImage(imageRef.current, points, bbox);
    },
    [imageRef],
  );

  /**
   * 점 추가
   */
  const addPoint = useCallback(
    (point: Point) => {
      setCurrentPoints((prev) => [...prev, point]);
    },
    [setCurrentPoints],
  );

  /**
   * 프레임 완성
   */
  const completeFrame = useCallback(() => {
    if (currentPoints.length < 3) return;

    const imageData = extractFrameImage(currentPoints);

    const newFrame: SpriteFrame = {
      id: nextFrameId,
      points: [...currentPoints],
      name: `Frame ${nextFrameId}`,
      imageData,
      offset: { x: 0, y: 0 },
    };

    setFrames((prev) => [...prev, newFrame]);
    setNextFrameId((prev) => prev + 1);
    setCurrentPoints([]);
  }, [currentPoints, extractFrameImage, nextFrameId, setCurrentPoints, setFrames, setNextFrameId]);

  /**
   * 현재 폴리곤 취소
   */
  const cancelPolygon = useCallback(() => {
    setCurrentPoints([]);
  }, [setCurrentPoints]);

  /**
   * 마지막 점 제거
   */
  const undoLastPoint = useCallback(() => {
    setCurrentPoints((prev) => prev.slice(0, -1));
  }, [setCurrentPoints]);

  /**
   * 모든 점 제거
   */
  const clearPoints = useCallback(() => {
    setCurrentPoints([]);
  }, [setCurrentPoints]);

  return {
    // State
    currentPoints,
    hasMinimumPoints,
    canComplete,

    // Actions
    addPoint,
    completeFrame,
    cancelPolygon,
    undoLastPoint,
    clearPoints,
  };
}
