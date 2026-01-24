"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Window from "./Window";
import { ToolMode } from "../types";

interface SpriteFrame {
  id: number;
  imageData?: string;
  name: string;
  offset: { x: number; y: number };
}

type DockZone = "left" | "right" | "top" | "bottom" | null;

interface FramePreviewWindowProps {
  isOpen: boolean;
  onClose: () => void;
  frames: SpriteFrame[];
  currentFrameIndex: number;
  onFrameChange: (index: number) => void;
  isBackgroundRemovalMode: boolean;
  onRemoveBackground: (frameId: number, x: number, y: number) => void;
  eraserTolerance: number;
  onToleranceChange: (tolerance: number) => void;
  toolMode?: ToolMode;
  // 도킹 관련 props
  windowId?: string;
  onDock?: (zone: DockZone, windowId: string) => void;
  isDocked?: boolean;
  dockPosition?: DockZone;
  dockedSize?: number;
  onUndock?: () => void;
  onDockedResize?: (newSize: number) => void;
}

export default function FramePreviewWindow({
  isOpen,
  onClose,
  frames,
  currentFrameIndex,
  onFrameChange,
  isBackgroundRemovalMode,
  onRemoveBackground,
  eraserTolerance,
  onToleranceChange,
  toolMode = "pen",
  windowId = "frame-preview",
  onDock,
  isDocked = false,
  dockPosition,
  dockedSize = 450,
  onUndock,
  onDockedResize,
}: FramePreviewWindowProps) {
  const [previewScale, setPreviewScale] = useState(3);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const validFrames = frames.filter((f) => f.imageData);
  const currentFrame = validFrames[currentFrameIndex];

  // Reset pan when frame changes
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [currentFrameIndex]);

  // Wheel zoom - 마우스 커서 위치 기준 확대/축소
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      // Calculate image coordinates under cursor (before zoom)
      const canvasTopLeftX = containerWidth / 2 + pan.x - canvasWidth / 2;
      const canvasTopLeftY = containerHeight / 2 + pan.y - canvasHeight / 2;

      const imageX = (mouseX - canvasTopLeftX) / previewScale;
      const imageY = (mouseY - canvasTopLeftY) / previewScale;

      // Calculate new scale
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(1, Math.min(20, previewScale * delta));

      if (newScale === previewScale) return;

      // New canvas size
      const newCanvasWidth = (canvasWidth / previewScale) * newScale;
      const newCanvasHeight = (canvasHeight / previewScale) * newScale;

      // Calculate new pan to keep image point under cursor
      const newPanX = mouseX - containerWidth / 2 + newCanvasWidth / 2 - imageX * newScale;
      const newPanY = mouseY - containerHeight / 2 + newCanvasHeight / 2 - imageY * newScale;

      setPreviewScale(newScale);
      setPan({ x: newPanX, y: newPanY });
    },
    [pan, previewScale],
  );

  // Register wheel event
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  // 프리뷰 캔버스 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrame?.imageData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * previewScale;
      canvas.height = img.height * previewScale;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, img.width * previewScale, img.height * previewScale);
    };
    img.src = currentFrame.imageData;
  }, [currentFrame, previewScale]);

  const handlePrev = () => {
    if (validFrames.length > 0) {
      const newIndex = (currentFrameIndex - 1 + validFrames.length) % validFrames.length;
      onFrameChange(newIndex);
    }
  };

  const handleNext = () => {
    if (validFrames.length > 0) {
      const newIndex = (currentFrameIndex + 1) % validFrames.length;
      onFrameChange(newIndex);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isBackgroundRemovalMode || !currentFrame) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Get exact border width from computed style
    const rect = canvas.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderRight = parseFloat(style.borderRightWidth) || 0;
    const borderBottom = parseFloat(style.borderBottomWidth) || 0;

    // Content dimensions (excluding border)
    const contentWidth = rect.width - borderLeft - borderRight;
    const contentHeight = rect.height - borderTop - borderBottom;

    const scaleX = canvas.width / contentWidth;
    const scaleY = canvas.height / contentHeight;

    // Mouse position relative to content area (excluding border)
    const clickX = ((e.clientX - rect.left - borderLeft) * scaleX) / previewScale;
    const clickY = ((e.clientY - rect.top - borderTop) * scaleY) / previewScale;

    onRemoveBackground(currentFrame.id, clickX, clickY);
  };

  // 스페이스바 패닝 기능
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 버튼, input 등에 포커스가 있으면 스페이스바 패닝 무시
      const target = e.target as HTMLElement;
      const isInteractiveElement =
        target.tagName === "BUTTON" ||
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.code === "Space" && !e.repeat && !isInteractiveElement) {
        e.preventDefault();
        setIsPanning(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsPanning(false);
        setIsDragging(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPanning || toolMode === "hand") {
      e.preventDefault();
      setIsDragging(true);
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 손 툴 또는 스페이스바로 패닝 활성화
  const isHandMode = toolMode === "hand" || isPanning;

  // 커서 결정
  const getCursor = () => {
    if (isHandMode) {
      return isDragging ? "grabbing" : "grab";
    }
    if (isBackgroundRemovalMode) {
      return "crosshair";
    }
    return "default";
  };

  return (
    <Window
      title="Frame Edit"
      isOpen={isOpen}
      onClose={onClose}
      initialPosition={{ x: 250, y: 150 }}
      initialSize={{ width: 450, height: 480 }}
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
        {/* 배경삭제 모드 표시 */}
        {isBackgroundRemovalMode && (
          <div className="bg-accent-danger/90 text-white text-center py-1.5 text-sm font-medium flex items-center justify-center gap-2">
            <svg
              className="w-4 h-4 animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
            배경삭제 모드 - 클릭하여 배경 제거
          </div>
        )}

        {/* 프리뷰 영역 */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden checkerboard relative"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: getCursor() }}
        >
          {currentFrame?.imageData ? (
            <canvas
              ref={canvasRef}
              onClick={isHandMode ? undefined : handleCanvasClick}
              className={`absolute border rounded ${
                isBackgroundRemovalMode
                  ? "border-accent-danger shadow-lg shadow-accent-danger/30"
                  : "border-border-default"
              }`}
              style={{
                cursor: getCursor(),
                pointerEvents: isHandMode ? "none" : "auto",
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm">
              No frame selected
            </div>
          )}
        </div>

        {/* 컨트롤 영역 */}
        <div className="p-3 border-t border-border-default space-y-3">
          {/* 프레임 이동 */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={handlePrev}
              className="btn btn-secondary text-sm"
              disabled={validFrames.length === 0}
            >
              ◀ 이전
            </button>
            <span className="px-4 text-sm text-text-primary">
              {validFrames.length > 0 ? `${currentFrameIndex + 1} / ${validFrames.length}` : "-"}
            </span>
            <button
              onClick={handleNext}
              className="btn btn-secondary text-sm"
              disabled={validFrames.length === 0}
            >
              다음 ▶
            </button>
          </div>

          {/* Scale & 허용치 컨트롤 */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-text-secondary">확대:</span>
              <input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={previewScale}
                onChange={(e) => setPreviewScale(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-8 text-center text-text-primary">{previewScale}x</span>
            </div>

            {isBackgroundRemovalMode && (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-text-secondary">허용치:</span>
                <input
                  type="range"
                  min="0"
                  max="128"
                  value={eraserTolerance}
                  onChange={(e) => onToleranceChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-6 text-center text-text-primary">{eraserTolerance}</span>
              </div>
            )}
          </div>

          {/* 프레임 이름 */}
          {currentFrame && (
            <div className="text-center text-xs text-text-tertiary">{currentFrame.name}</div>
          )}
        </div>
      </div>
    </Window>
  );
}
