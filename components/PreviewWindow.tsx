"use client";

import { useState, useRef, useEffect } from "react";
import Window from "./Window";

interface SpriteFrame {
  id: string;
  imageUrl?: string;
  offset: { x: number; y: number };
}

type DockZone = "left" | "right" | "top" | "bottom" | null;

interface PreviewWindowProps {
  isOpen: boolean;
  onClose: () => void;
  frames: SpriteFrame[];
  fps: number;
  onFpsChange: (fps: number) => void;
  // 도킹 관련 props
  windowId?: string;
  onDock?: (zone: DockZone, windowId: string) => void;
  isDocked?: boolean;
  dockPosition?: DockZone;
  dockedSize?: number;
  onUndock?: () => void;
  onDockedResize?: (newSize: number) => void;
}

export default function PreviewWindow({
  isOpen,
  onClose,
  frames,
  fps,
  onFpsChange,
  windowId = "preview",
  onDock,
  isDocked = false,
  dockPosition,
  dockedSize = 400,
  onUndock,
  onDockedResize,
}: PreviewWindowProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [previewScale, setPreviewScale] = useState(2);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const validFrames = frames.filter((f) => f.imageUrl);

  // 애니메이션 재생
  useEffect(() => {
    if (!isPlaying || validFrames.length === 0) return;

    const interval = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % validFrames.length);
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [isPlaying, fps, validFrames.length]);

  // 프리뷰 캔버스 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || validFrames.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const currentFrame = validFrames[currentFrameIndex];
    if (!currentFrame?.imageUrl) return;

    const img = new Image();
    img.onload = () => {
      // 최대 프레임 크기 계산
      const maxWidth = img.width;
      const maxHeight = img.height;

      canvas.width = maxWidth * previewScale;
      canvas.height = maxHeight * previewScale;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      const drawX = currentFrame.offset.x * previewScale;
      const drawY = currentFrame.offset.y * previewScale;
      ctx.drawImage(img, drawX, drawY, img.width * previewScale, img.height * previewScale);
    };
    img.src = currentFrame.imageUrl;
  }, [currentFrameIndex, validFrames, previewScale]);

  return (
    <Window
      title="Animation Preview"
      isOpen={isOpen}
      onClose={onClose}
      initialPosition={{ x: 200, y: 100 }}
      initialSize={{ width: 400, height: 450 }}
      minSize={{ width: 300, height: 350 }}
      windowId={windowId}
      onDock={onDock}
      isDocked={isDocked}
      dockPosition={dockPosition}
      dockedSize={dockedSize}
      onUndock={onUndock}
      onDockedResize={onDockedResize}
    >
      <div className="flex flex-col h-full bg-surface-primary">
        {/* 프리뷰 영역 */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden checkerboard">
          {validFrames.length > 0 ? (
            <canvas
              ref={canvasRef}
              className="border border-border-default rounded"
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          ) : (
            <div className="text-text-tertiary text-sm">No frames to preview</div>
          )}
        </div>

        {/* 컨트롤 영역 */}
        <div className="p-3 border-t border-border-default space-y-3">
          {/* 재생 컨트롤 */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() =>
                setCurrentFrameIndex((prev) => (prev - 1 + validFrames.length) % validFrames.length)
              }
              className="btn btn-secondary text-sm"
              disabled={validFrames.length === 0}
            >
              ◀
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`btn text-sm font-medium ${isPlaying ? "btn-danger" : "btn-primary"}`}
              disabled={validFrames.length === 0}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              onClick={() => setCurrentFrameIndex((prev) => (prev + 1) % validFrames.length)}
              className="btn btn-secondary text-sm"
              disabled={validFrames.length === 0}
            >
              ▶
            </button>
          </div>

          {/* FPS & Scale 컨트롤 */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-text-secondary whitespace-nowrap">FPS:</span>
              <input
                type="range"
                min="1"
                max="30"
                value={fps}
                onChange={(e) => onFpsChange(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-8 text-center text-text-primary">{fps}</span>
            </div>

            <div className="flex items-center gap-2 flex-1">
              <span className="text-text-secondary whitespace-nowrap">Scale:</span>
              <input
                type="range"
                min="1"
                max="5"
                step="0.5"
                value={previewScale}
                onChange={(e) => setPreviewScale(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-8 text-center text-text-primary">{previewScale}x</span>
            </div>
          </div>

          {/* 프레임 정보 */}
          <div className="text-center text-xs text-text-tertiary">
            Frame {currentFrameIndex + 1} / {validFrames.length}
          </div>
        </div>
      </div>
    </Window>
  );
}
