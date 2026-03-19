"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Modal } from "@/shared/components";
import {
  BrushIcon,
  EraserIcon,
  FillBucketIcon,
  ImageIcon,
} from "@/shared/components/icons";
import type { ImageClip } from "../types";
import { loadImageElement } from "../utils";

type OverlayTool = "brush" | "eraser";

interface VideoCanvasOverlayModalProps {
  isOpen: boolean;
  clip: ImageClip | null;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

interface ViewportSize {
  width: number;
  height: number;
}

const CHECKER_SIZE = 12;
const DEFAULT_VIEWPORT: ViewportSize = { width: 720, height: 420 };

function drawCheckerboard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  context.clearRect(0, 0, width, height);
  for (let y = 0; y < height; y += CHECKER_SIZE) {
    for (let x = 0; x < width; x += CHECKER_SIZE) {
      const even = ((x / CHECKER_SIZE) + (y / CHECKER_SIZE)) % 2 === 0;
      context.fillStyle = even ? "#f3f4f6" : "#d1d5db";
      context.fillRect(x, y, CHECKER_SIZE, CHECKER_SIZE);
    }
  }
}

function fitCanvasSize(
  sourceWidth: number,
  sourceHeight: number,
  viewport: ViewportSize
): ViewportSize {
  const maxWidth = Math.max(240, viewport.width - 24);
  const maxHeight = Math.max(180, viewport.height - 24);
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function VideoCanvasOverlayModal({
  isOpen,
  clip,
  onClose,
  onSave,
}: VideoCanvasOverlayModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerStateRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

  const [tool, setTool] = useState<OverlayTool>("brush");
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(48);
  const [isReady, setIsReady] = useState(false);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(DEFAULT_VIEWPORT);

  const sourceSize = useMemo(() => {
    return {
      width: Math.max(1, Math.round(clip?.sourceSize.width || 1)),
      height: Math.max(1, Math.round(clip?.sourceSize.height || 1)),
    };
  }, [clip]);

  const previewSize = useMemo(
    () => fitCanvasSize(sourceSize.width, sourceSize.height, viewportSize),
    [sourceSize.height, sourceSize.width, viewportSize]
  );

  const renderPreview = useCallback(() => {
    const previewCanvas = previewCanvasRef.current;
    const sourceCanvas = sourceCanvasRef.current;
    if (!previewCanvas || !sourceCanvas) return;

    previewCanvas.width = previewSize.width;
    previewCanvas.height = previewSize.height;

    const context = previewCanvas.getContext("2d");
    if (!context) return;

    drawCheckerboard(context, previewSize.width, previewSize.height);
    context.drawImage(sourceCanvas, 0, 0, previewSize.width, previewSize.height);
  }, [previewSize.height, previewSize.width]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const element = containerRef.current;
    const updateViewport = () => {
      setViewportSize({
        width: Math.max(320, element.clientWidth),
        height: Math.max(220, element.clientHeight),
      });
    };

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !clip) {
      setIsReady(false);
      return;
    }

    let cancelled = false;
    const sourceUrl = clip.sourceUrl;

    async function initializeCanvas() {
      setIsReady(false);

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = sourceSize.width;
      sourceCanvas.height = sourceSize.height;

      const context = sourceCanvas.getContext("2d");
      if (!context) {
        return;
      }

      context.clearRect(0, 0, sourceSize.width, sourceSize.height);

      if (sourceUrl) {
        try {
          const image = await loadImageElement(sourceUrl);
          if (!cancelled) {
            context.drawImage(image, 0, 0, sourceSize.width, sourceSize.height);
          }
        } catch (error) {
          console.error("Failed to initialize overlay canvas:", error);
        }
      }

      if (cancelled) return;
      sourceCanvasRef.current = sourceCanvas;
      setIsReady(true);
    }

    void initializeCanvas();

    return () => {
      cancelled = true;
    };
  }, [clip, isOpen, sourceSize.height, sourceSize.width]);

  useEffect(() => {
    if (!isOpen || !isReady) return;
    renderPreview();
  }, [isOpen, isReady, renderPreview]);

  const getSourcePoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const normalizedX = (event.clientX - rect.left) / rect.width;
    const normalizedY = (event.clientY - rect.top) / rect.height;

    return {
      x: Math.max(0, Math.min(sourceSize.width, normalizedX * sourceSize.width)),
      y: Math.max(0, Math.min(sourceSize.height, normalizedY * sourceSize.height)),
    };
  }, [sourceSize.height, sourceSize.width]);

  const drawStrokeSegment = useCallback((fromX: number, fromY: number, toX: number, toY: number) => {
    const sourceCanvas = sourceCanvasRef.current;
    if (!sourceCanvas) return;

    const context = sourceCanvas.getContext("2d");
    if (!context) return;

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brushSize;
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = brushColor;
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();
    context.restore();
    renderPreview();
  }, [brushColor, brushSize, renderPreview, tool]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = getSourcePoint(event);
    if (!point) return;

    pointerStateRef.current = {
      pointerId: event.pointerId,
      x: point.x,
      y: point.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    drawStrokeSegment(point.x, point.y, point.x, point.y);
  }, [drawStrokeSegment, getSourcePoint]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointerState = pointerStateRef.current;
    if (!pointerState || pointerState.pointerId !== event.pointerId) return;

    const point = getSourcePoint(event);
    if (!point) return;

    drawStrokeSegment(pointerState.x, pointerState.y, point.x, point.y);
    pointerStateRef.current = {
      pointerId: event.pointerId,
      x: point.x,
      y: point.y,
    };
  }, [drawStrokeSegment, getSourcePoint]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerStateRef.current?.pointerId !== event.pointerId) return;
    pointerStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleFillAll = useCallback(() => {
    const sourceCanvas = sourceCanvasRef.current;
    if (!sourceCanvas) return;

    const context = sourceCanvas.getContext("2d");
    if (!context) return;

    context.save();
    context.globalCompositeOperation = "source-over";
    context.fillStyle = brushColor;
    context.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    context.restore();
    renderPreview();
  }, [brushColor, renderPreview]);

  const handleClear = useCallback(() => {
    const sourceCanvas = sourceCanvasRef.current;
    if (!sourceCanvas) return;

    const context = sourceCanvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    renderPreview();
  }, [renderPreview]);

  const handleSave = useCallback(() => {
    const sourceCanvas = sourceCanvasRef.current;
    if (!sourceCanvas) return;
    onSave(sourceCanvas.toDataURL("image/png"));
  }, [onSave]);

  const title = clip?.name || "오버레이 캔버스 편집";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width="min(1080px, 96vw)"
      maxHeight="92vh"
      contentClassName="flex min-h-0 flex-col gap-4 p-4"
      footer={(
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-text-tertiary">
            {sourceSize.width} × {sourceSize.height}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border-default px-3 py-2 text-sm hover:bg-surface-secondary transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!isReady}
              className="rounded-lg bg-accent-primary px-3 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50 transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      )}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border-default bg-surface-secondary p-2">
        <button
          onClick={() => setTool("brush")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            tool === "brush"
              ? "bg-accent-primary text-white"
              : "hover:bg-surface-tertiary text-text-secondary"
          }`}
        >
          <BrushIcon className="h-4 w-4" />
          브러시
        </button>
        <button
          onClick={() => setTool("eraser")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            tool === "eraser"
              ? "bg-accent-primary text-white"
              : "hover:bg-surface-tertiary text-text-secondary"
          }`}
        >
          <EraserIcon className="h-4 w-4" />
          지우개
        </button>
        <div className="mx-1 h-6 w-px bg-border-default" />
        <label className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-primary px-3 py-2 text-sm">
          <span className="text-text-secondary">색상</span>
          <input
            type="color"
            value={brushColor}
            onChange={(event) => setBrushColor(event.target.value)}
            className="h-7 w-8 cursor-pointer rounded border border-border-default bg-transparent p-0"
          />
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-primary px-3 py-2 text-sm">
          <span className="text-text-secondary">브러시</span>
          <input
            type="range"
            min={4}
            max={240}
            step={2}
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            className="w-32"
          />
          <span className="w-10 text-right text-text-tertiary">{brushSize}px</span>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleFillAll}
            disabled={!isReady}
            className="inline-flex items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm hover:bg-surface-tertiary disabled:opacity-50 transition-colors"
          >
            <FillBucketIcon className="h-4 w-4" />
            전체 채우기
          </button>
          <button
            onClick={handleClear}
            disabled={!isReady}
            className="inline-flex items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm hover:bg-surface-tertiary disabled:opacity-50 transition-colors"
          >
            <ImageIcon className="h-4 w-4" />
            전체 지우기
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex min-h-[360px] flex-1 items-center justify-center overflow-auto rounded-2xl border border-border-default bg-surface-primary p-3"
      >
        {!isReady ? (
          <div className="text-sm text-text-tertiary">오버레이 캔버스를 준비하는 중...</div>
        ) : (
          <canvas
            ref={previewCanvasRef}
            width={previewSize.width}
            height={previewSize.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="max-w-full cursor-crosshair rounded-lg border border-border-default shadow-sm"
            style={{ width: previewSize.width, height: previewSize.height }}
          />
        )}
      </div>
    </Modal>
  );
}
