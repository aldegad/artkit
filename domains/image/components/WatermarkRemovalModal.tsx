"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Modal } from "@/shared/components/Modal";
import { SpinnerIcon } from "@/shared/components/icons";

interface WatermarkRemovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (maskCanvas: HTMLCanvasElement) => Promise<void>;
  sourceCanvas: HTMLCanvasElement | null;
  isProcessing: boolean;
  progress: number;
  status: string;
}

export function WatermarkRemovalModal({
  isOpen,
  onClose,
  onApply,
  sourceCanvas,
  isProcessing,
  progress,
  status,
}: WatermarkRemovalModalProps) {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const scaleRef = useRef(1);

  const [brushSize, setBrushSize] = useState(20);
  const [isEraser, setIsEraser] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasMask, setHasMask] = useState(false);

  const renderDisplay = useCallback(() => {
    const displayCanvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!displayCanvas || !sourceCanvas || !maskCanvas) return;

    const ctx = displayCanvas.getContext("2d")!;
    const scale = scaleRef.current;
    const dw = displayCanvas.width;
    const dh = displayCanvas.height;

    ctx.clearRect(0, 0, dw, dh);

    // Checkerboard
    const cs = 8;
    for (let y = 0; y < dh; y += cs) {
      for (let x = 0; x < dw; x += cs) {
        ctx.fillStyle =
          ((x / cs + y / cs) | 0) % 2 ? "#e0e0e0" : "#ffffff";
        ctx.fillRect(x, y, cs, cs);
      }
    }

    // Source image
    ctx.drawImage(sourceCanvas, 0, 0, dw, dh);

    // Red mask overlay
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = sourceCanvas.width;
    tempCanvas.height = sourceCanvas.height;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.drawImage(maskCanvas, 0, 0);
    tempCtx.globalCompositeOperation = "source-in";
    tempCtx.fillStyle = "rgba(255, 50, 50, 1)";
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.drawImage(tempCanvas, 0, 0, dw, dh);
    ctx.restore();

    // Mask border highlight
    const borderCanvas = document.createElement("canvas");
    borderCanvas.width = sourceCanvas.width;
    borderCanvas.height = sourceCanvas.height;
    const borderCtx = borderCanvas.getContext("2d")!;
    borderCtx.drawImage(maskCanvas, 0, 0);
    borderCtx.globalCompositeOperation = "source-in";
    borderCtx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    borderCtx.lineWidth = 2 / scale;

    // Simple border: draw mask outline with a dilated version
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
  }, [sourceCanvas]);

  // Initialize on open
  useEffect(() => {
    if (!isOpen || !sourceCanvas) return;

    const { width, height } = sourceCanvas;
    const maxW = 640;
    const maxH = 460;
    const scale = Math.min(maxW / width, maxH / height, 1);
    scaleRef.current = scale;

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    maskCanvasRef.current = maskCanvas;
    setHasMask(false);
    setIsEraser(false);

    // Wait for ref to be mounted
    requestAnimationFrame(() => {
      const displayCanvas = displayCanvasRef.current;
      if (!displayCanvas) return;
      displayCanvas.width = Math.round(width * scale);
      displayCanvas.height = Math.round(height * scale);
      renderDisplay();
    });
  }, [isOpen, sourceCanvas, renderDisplay]);

  const getImagePos = useCallback(
    (e: React.MouseEvent) => {
      const canvas = displayCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scale = scaleRef.current;
      return {
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale,
      };
    },
    []
  );

  const strokeLine = useCallback(
    (
      x0: number,
      y0: number,
      x1: number,
      y1: number
    ) => {
      const maskCanvas = maskCanvasRef.current;
      if (!maskCanvas) return;
      const ctx = maskCanvas.getContext("2d")!;

      ctx.globalCompositeOperation = isEraser
        ? "destination-out"
        : "source-over";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = "white";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    },
    [brushSize, isEraser]
  );

  const dotAt = useCallback(
    (x: number, y: number) => {
      const maskCanvas = maskCanvasRef.current;
      if (!maskCanvas) return;
      const ctx = maskCanvas.getContext("2d")!;

      ctx.globalCompositeOperation = isEraser
        ? "destination-out"
        : "source-over";
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    },
    [brushSize, isEraser]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isProcessing) return;
      e.preventDefault();
      setIsDrawing(true);
      const pos = getImagePos(e);
      dotAt(pos.x, pos.y);
      lastPosRef.current = pos;
      renderDisplay();
      setHasMask(true);
    },
    [isProcessing, getImagePos, dotAt, renderDisplay]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || isProcessing) return;
      const pos = getImagePos(e);
      const prev = lastPosRef.current;
      if (prev) {
        strokeLine(prev.x, prev.y, pos.x, pos.y);
      } else {
        dotAt(pos.x, pos.y);
      }
      lastPosRef.current = pos;
      renderDisplay();
      setHasMask(true);
    },
    [isDrawing, isProcessing, getImagePos, strokeLine, dotAt, renderDisplay]
  );

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
    lastPosRef.current = null;
  }, []);

  const handleApply = useCallback(async () => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas || !hasMask) return;
    await onApply(maskCanvas);
  }, [hasMask, onApply]);

  const handleClearMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    renderDisplay();
    setHasMask(false);
  }, [renderDisplay]);

  if (!isOpen) return null;

  // Processing spinner modal
  if (isProcessing) {
    return (
      <Modal
        isOpen
        onClose={() => {}}
        title="워터마크 제거"
        width="320px"
        closeOnBackdropClick={false}
        closeOnEscape={false}
        hideCloseButton
        contentClassName="px-6 py-5"
      >
        <div className="flex flex-col items-center gap-4">
          <SpinnerIcon className="w-12 h-12 text-accent-primary" />
          <div className="text-center w-full">
            <p className="text-text-secondary text-sm mt-1">{status}</p>
            <div className="mt-3 w-full bg-surface-secondary rounded-full h-2 overflow-hidden">
              <div
                className="bg-accent-primary h-full transition-all duration-300 ease-out"
                style={{
                  width: `${Math.max(0, Math.min(100, progress))}%`,
                }}
              />
            </div>
            <p className="text-text-tertiary text-xs mt-2">
              {Math.round(progress)}%
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  const title = (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center">
        <svg
          className="w-5 h-5 text-accent-primary"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 4l12 12M16 4L4 16" strokeLinecap="round" />
          <rect
            x="2"
            y="2"
            width="16"
            height="16"
            rx="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-text-primary">
        워터마크 제거
      </h3>
    </div>
  );

  const footer = (
    <div className="flex gap-2 justify-end">
      <button
        onClick={handleClearMask}
        disabled={!hasMask}
        className="px-4 py-2 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        마스크 초기화
      </button>
      <button
        onClick={onClose}
        className="px-4 py-2 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors"
      >
        취소
      </button>
      <button
        onClick={handleApply}
        disabled={!hasMask}
        className="px-4 py-2 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        제거 실행
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width="720px"
      maxHeight="90vh"
      contentClassName="px-6 py-4 space-y-4"
      footer={footer}
    >
      <p className="text-text-secondary text-sm">
        워터마크 영역을 브러시로 칠한 후 &quot;제거 실행&quot;을
        클릭하세요.
      </p>
      <p className="text-text-tertiary text-xs">
        첫 실행 시 MI-GAN 인페인팅 모델을 다운로드합니다.
      </p>

      {/* Brush tools */}
      <div className="flex items-center gap-4 py-1">
        <div className="flex items-center gap-1 bg-surface-secondary rounded p-0.5">
          <button
            onClick={() => setIsEraser(false)}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              !isEraser
                ? "bg-accent-primary text-white"
                : "hover:bg-surface-tertiary text-text-secondary"
            }`}
          >
            브러시
          </button>
          <button
            onClick={() => setIsEraser(true)}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              isEraser
                ? "bg-accent-primary text-white"
                : "hover:bg-surface-tertiary text-text-secondary"
            }`}
          >
            지우개
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-tertiary whitespace-nowrap">
            크기
          </label>
          <input
            type="range"
            min={2}
            max={100}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-24 accent-accent-primary"
          />
          <span className="text-xs text-text-tertiary w-8 text-right tabular-nums">
            {brushSize}px
          </span>
        </div>
      </div>

      {/* Canvas area */}
      <div
        className="flex items-center justify-center bg-surface-secondary rounded border border-border-default overflow-hidden select-none"
        style={{ minHeight: "280px" }}
      >
        <canvas
          ref={displayCanvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={isEraser ? "cursor-cell" : "cursor-crosshair"}
          style={{ imageRendering: "auto" }}
        />
      </div>

      {!hasMask && (
        <p className="text-text-tertiary text-xs text-center">
          워터마크가 있는 영역을 빨간색 브러시로 칠해주세요
        </p>
      )}
    </Modal>
  );
}
