import { useCallback, useEffect } from "react";
import { Point } from "../../types";

interface UseHandToolOptions {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: Point;
  setPan: React.Dispatch<React.SetStateAction<Point>>;
  scale: number;
  isPanning: boolean;
  setIsPanning: (panning: boolean) => void;
  lastPanPoint: Point;
  setLastPanPoint: (point: Point) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  didPanOrDragRef: React.RefObject<boolean>;
}

interface UseHandToolReturn {
  // State
  zoom: number;
  pan: Point;
  isPanning: boolean;

  // Actions
  startPan: (clientX: number, clientY: number) => void;
  updatePan: (clientX: number, clientY: number) => void;
  endPan: () => void;
  handleWheel: (e: WheelEvent) => void;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoomLevel: (level: number) => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.2;
const SMOOTH_ZOOM_FACTOR = 0.03;

/**
 * 손 툴 (팬/줌) 로직을 관리하는 훅
 */
export function useHandTool({
  zoom,
  setZoom,
  pan,
  setPan,
  scale,
  isPanning,
  setIsPanning,
  lastPanPoint,
  setLastPanPoint,
  canvasRef,
  didPanOrDragRef,
}: UseHandToolOptions): UseHandToolReturn {
  /**
   * 팬 시작
   */
  const startPan = useCallback(
    (clientX: number, clientY: number) => {
      setIsPanning(true);
      setLastPanPoint({ x: clientX, y: clientY });
    },
    [setIsPanning, setLastPanPoint],
  );

  /**
   * 팬 업데이트
   */
  const updatePan = useCallback(
    (clientX: number, clientY: number) => {
      if (!isPanning) return;

      const dx = clientX - lastPanPoint.x;
      const dy = clientY - lastPanPoint.y;

      if ((dx !== 0 || dy !== 0) && didPanOrDragRef) {
        didPanOrDragRef.current = true;
      }

      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPanPoint({ x: clientX, y: clientY });
    },
    [isPanning, lastPanPoint, setPan, setLastPanPoint, didPanOrDragRef],
  );

  /**
   * 팬 종료
   */
  const endPan = useCallback(() => {
    setIsPanning(false);
  }, [setIsPanning]);

  /**
   * 휠 줌 (마우스 위치 기준)
   */
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 줌 전 마우스 위치의 이미지 좌표
      const imgX = (mouseX - pan.x) / (scale * zoom);
      const imgY = (mouseY - pan.y) / (scale * zoom);

      // 부드러운 줌
      const delta = e.deltaY > 0 ? 1 - SMOOTH_ZOOM_FACTOR : 1 + SMOOTH_ZOOM_FACTOR;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * delta));

      // 줌 후 같은 이미지 좌표가 마우스 위치에 오도록 pan 조정
      const newPanX = mouseX - imgX * scale * newZoom;
      const newPanY = mouseY - imgY * scale * newZoom;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    },
    [pan, scale, zoom, canvasRef, setZoom, setPan],
  );

  /**
   * 뷰 리셋
   */
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [setZoom, setPan]);

  /**
   * 줌 인
   */
  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev * ZOOM_STEP));
  }, [setZoom]);

  /**
   * 줌 아웃
   */
  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(MIN_ZOOM, prev / ZOOM_STEP));
  }, [setZoom]);

  /**
   * 줌 레벨 직접 설정
   */
  const setZoomLevel = useCallback(
    (level: number) => {
      setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level)));
    },
    [setZoom],
  );

  // 휠 이벤트를 non-passive로 등록 (preventDefault 사용 가능)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel, canvasRef]);

  return {
    // State
    zoom,
    pan,
    isPanning,

    // Actions
    startPan,
    updatePan,
    endPan,
    handleWheel,
    resetView,
    zoomIn,
    zoomOut,
    setZoomLevel,
  };
}
