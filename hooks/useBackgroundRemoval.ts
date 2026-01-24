import { useCallback } from "react";
import { SpriteFrame } from "../types";
import { getBoundingBox } from "../utils/geometry";

interface UseBackgroundRemovalOptions {
  frames: SpriteFrame[];
  setFrames: React.Dispatch<React.SetStateAction<SpriteFrame[]>>;
  isBackgroundRemovalMode: boolean;
  setIsBackgroundRemovalMode: (mode: boolean) => void;
  eraserTolerance: number;
  setEraserTolerance: (tolerance: number) => void;
}

interface UseBackgroundRemovalReturn {
  // State
  isBackgroundRemovalMode: boolean;
  eraserTolerance: number;

  // Actions
  toggleMode: () => void;
  enableMode: () => void;
  disableMode: () => void;
  setTolerance: (tolerance: number) => void;
  removeBackground: (frameId: number, clickX: number, clickY: number) => void;
}

/**
 * 배경 제거 (마법봉/Flood Fill) 로직을 관리하는 훅
 */
export function useBackgroundRemoval({
  frames,
  setFrames,
  isBackgroundRemovalMode,
  setIsBackgroundRemovalMode,
  eraserTolerance,
  setEraserTolerance,
}: UseBackgroundRemovalOptions): UseBackgroundRemovalReturn {
  /**
   * 모드 토글
   */
  const toggleMode = useCallback(() => {
    setIsBackgroundRemovalMode(!isBackgroundRemovalMode);
  }, [isBackgroundRemovalMode, setIsBackgroundRemovalMode]);

  /**
   * 모드 활성화
   */
  const enableMode = useCallback(() => {
    setIsBackgroundRemovalMode(true);
  }, [setIsBackgroundRemovalMode]);

  /**
   * 모드 비활성화
   */
  const disableMode = useCallback(() => {
    setIsBackgroundRemovalMode(false);
  }, [setIsBackgroundRemovalMode]);

  /**
   * 허용치 설정
   */
  const setTolerance = useCallback(
    (tolerance: number) => {
      setEraserTolerance(Math.max(0, Math.min(128, tolerance)));
    },
    [setEraserTolerance],
  );

  /**
   * 마법봉 배경 제거 (Flood Fill)
   */
  const removeBackground = useCallback(
    (frameId: number, clickX: number, clickY: number) => {
      const frame = frames.find((f) => f.id === frameId);
      if (!frame?.imageData) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // 클릭 위치의 색상 가져오기
        const bbox = getBoundingBox(frame.points);
        const localX = Math.round(clickX - bbox.minX);
        const localY = Math.round(clickY - bbox.minY);

        if (localX < 0 || localX >= canvas.width || localY < 0 || localY >= canvas.height) return;

        const startIdx = (localY * canvas.width + localX) * 4;
        const targetR = data[startIdx];
        const targetG = data[startIdx + 1];
        const targetB = data[startIdx + 2];
        const targetA = data[startIdx + 3];

        // 이미 투명하면 무시
        if (targetA === 0) return;

        // 색상 비교 함수
        const colorMatch = (idx: number): boolean => {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          if (a === 0) return false;
          const diff = Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);
          return diff <= eraserTolerance;
        };

        // Flood Fill (BFS)
        const visited = new Set<number>();
        const queue: number[] = [localY * canvas.width + localX];
        visited.add(queue[0]);

        while (queue.length > 0) {
          const pos = queue.shift()!;
          const x = pos % canvas.width;
          const y = Math.floor(pos / canvas.width);
          const idx = pos * 4;

          if (colorMatch(idx)) {
            // 투명하게 만들기
            data[idx + 3] = 0;

            // 상하좌우 이웃 추가
            const neighbors = [
              { nx: x - 1, ny: y },
              { nx: x + 1, ny: y },
              { nx: x, ny: y - 1 },
              { nx: x, ny: y + 1 },
            ];

            for (const { nx, ny } of neighbors) {
              if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height) {
                const nPos = ny * canvas.width + nx;
                if (!visited.has(nPos)) {
                  visited.add(nPos);
                  queue.push(nPos);
                }
              }
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);
        const newImageData = canvas.toDataURL("image/png");

        setFrames((prev) =>
          prev.map((f) => (f.id === frameId ? { ...f, imageData: newImageData } : f)),
        );
      };
      img.src = frame.imageData;
    },
    [frames, eraserTolerance, setFrames],
  );

  return {
    // State
    isBackgroundRemovalMode,
    eraserTolerance,

    // Actions
    toggleMode,
    enableMode,
    disableMode,
    setTolerance,
    removeBackground,
  };
}
