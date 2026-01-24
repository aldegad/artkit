import { useCallback } from "react";
import { Point, SpriteFrame } from "../../types";
import {
  isPointInPolygon,
  isNearPointOnScreen,
  TransformParams,
  getBoundingBox,
} from "../../utils/geometry";
import { extractPolygonImage } from "../../utils/canvas";

interface UseSelectToolOptions {
  frames: SpriteFrame[];
  setFrames: React.Dispatch<React.SetStateAction<SpriteFrame[]>>;
  selectedFrameId: number | null;
  setSelectedFrameId: (id: number | null) => void;
  selectedPointIndex: number | null;
  setSelectedPointIndex: (index: number | null) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  dragStart: Point;
  setDragStart: (start: Point) => void;
  imageRef: React.RefObject<HTMLImageElement | null>;
  getTransformParams: () => TransformParams;
}

interface UseSelectToolReturn {
  // State
  selectedFrameId: number | null;
  selectedPointIndex: number | null;
  isDragging: boolean;
  hasSelection: boolean;
  selectedFrame: SpriteFrame | undefined;

  // Actions
  selectFrameAtPoint: (imagePoint: Point) => boolean;
  selectPointAtPosition: (imagePoint: Point, threshold?: number) => boolean;
  clearSelection: () => void;
  deleteSelectedFrame: () => void;
  startDrag: (imagePoint: Point) => void;
  updateDrag: (imagePoint: Point) => void;
  endDrag: () => void;
  moveSelectedFrame: (dx: number, dy: number) => void;
  moveSelectedPoint: (dx: number, dy: number) => void;
}

/**
 * 선택 툴 로직을 관리하는 훅
 */
export function useSelectTool({
  frames,
  setFrames,
  selectedFrameId,
  setSelectedFrameId,
  selectedPointIndex,
  setSelectedPointIndex,
  isDragging,
  setIsDragging,
  dragStart,
  setDragStart,
  imageRef,
  getTransformParams,
}: UseSelectToolOptions): UseSelectToolReturn {
  const hasSelection = selectedFrameId !== null;
  const selectedFrame = frames.find((f) => f.id === selectedFrameId);

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
   * 이미지 좌표 기준으로 프레임 선택
   */
  const selectFrameAtPoint = useCallback(
    (imagePoint: Point): boolean => {
      for (const frame of frames) {
        if (isPointInPolygon(imagePoint, frame.points)) {
          setSelectedFrameId(frame.id);
          setSelectedPointIndex(null);
          return true;
        }
      }
      return false;
    },
    [frames, setSelectedFrameId, setSelectedPointIndex],
  );

  /**
   * 선택된 프레임의 점 선택
   */
  const selectPointAtPosition = useCallback(
    (imagePoint: Point, threshold = 12): boolean => {
      if (selectedFrameId === null || !selectedFrame) return false;

      const transform = getTransformParams();
      for (let i = 0; i < selectedFrame.points.length; i++) {
        if (isNearPointOnScreen(imagePoint, selectedFrame.points[i], transform, threshold)) {
          setSelectedPointIndex(i);
          return true;
        }
      }
      return false;
    },
    [selectedFrameId, selectedFrame, setSelectedPointIndex, getTransformParams],
  );

  /**
   * 선택 해제
   */
  const clearSelection = useCallback(() => {
    setSelectedFrameId(null);
    setSelectedPointIndex(null);
  }, [setSelectedFrameId, setSelectedPointIndex]);

  /**
   * 선택된 프레임 삭제
   */
  const deleteSelectedFrame = useCallback(() => {
    if (selectedFrameId === null) return;

    setFrames((prev) => prev.filter((f) => f.id !== selectedFrameId));
    setSelectedFrameId(null);
    setSelectedPointIndex(null);
  }, [selectedFrameId, setFrames, setSelectedFrameId, setSelectedPointIndex]);

  /**
   * 드래그 시작
   */
  const startDrag = useCallback(
    (imagePoint: Point) => {
      setIsDragging(true);
      setDragStart(imagePoint);
    },
    [setIsDragging, setDragStart],
  );

  /**
   * 드래그 업데이트 (이동)
   */
  const updateDrag = useCallback(
    (imagePoint: Point) => {
      if (!isDragging || selectedFrameId === null) return;

      const dx = imagePoint.x - dragStart.x;
      const dy = imagePoint.y - dragStart.y;

      setFrames((prev) =>
        prev.map((frame) => {
          if (frame.id !== selectedFrameId) return frame;

          if (selectedPointIndex !== null) {
            // 포인트만 이동
            const newPoints = [...frame.points];
            newPoints[selectedPointIndex] = {
              x: newPoints[selectedPointIndex].x + dx,
              y: newPoints[selectedPointIndex].y + dy,
            };
            return { ...frame, points: newPoints };
          } else {
            // 전체 프레임 이동
            const newPoints = frame.points.map((p) => ({
              x: p.x + dx,
              y: p.y + dy,
            }));
            return { ...frame, points: newPoints };
          }
        }),
      );
      setDragStart(imagePoint);
    },
    [isDragging, selectedFrameId, selectedPointIndex, dragStart, setFrames, setDragStart],
  );

  /**
   * 드래그 종료
   */
  const endDrag = useCallback(() => {
    if (isDragging && selectedFrameId !== null) {
      // 이미지 데이터 업데이트
      setFrames((prev) =>
        prev.map((frame) => {
          if (frame.id !== selectedFrameId) return frame;
          const newImageData = extractFrameImage(frame.points);
          return { ...frame, imageData: newImageData };
        }),
      );
    }
    setIsDragging(false);
  }, [isDragging, selectedFrameId, setFrames, setIsDragging, extractFrameImage]);

  /**
   * 선택된 프레임 이동
   */
  const moveSelectedFrame = useCallback(
    (dx: number, dy: number) => {
      if (selectedFrameId === null) return;

      setFrames((prev) =>
        prev.map((frame) => {
          if (frame.id !== selectedFrameId) return frame;
          const newPoints = frame.points.map((p) => ({
            x: p.x + dx,
            y: p.y + dy,
          }));
          const newImageData = extractFrameImage(newPoints);
          return { ...frame, points: newPoints, imageData: newImageData };
        }),
      );
    },
    [selectedFrameId, setFrames, extractFrameImage],
  );

  /**
   * 선택된 점 이동
   */
  const moveSelectedPoint = useCallback(
    (dx: number, dy: number) => {
      if (selectedFrameId === null || selectedPointIndex === null) return;

      setFrames((prev) =>
        prev.map((frame) => {
          if (frame.id !== selectedFrameId) return frame;
          const newPoints = [...frame.points];
          newPoints[selectedPointIndex] = {
            x: newPoints[selectedPointIndex].x + dx,
            y: newPoints[selectedPointIndex].y + dy,
          };
          const newImageData = extractFrameImage(newPoints);
          return { ...frame, points: newPoints, imageData: newImageData };
        }),
      );
    },
    [selectedFrameId, selectedPointIndex, setFrames, extractFrameImage],
  );

  return {
    // State
    selectedFrameId,
    selectedPointIndex,
    isDragging,
    hasSelection,
    selectedFrame,

    // Actions
    selectFrameAtPoint,
    selectPointAtPosition,
    clearSelection,
    deleteSelectedFrame,
    startDrag,
    updateDrag,
    endDrag,
    moveSelectedFrame,
    moveSelectedPoint,
  };
}
