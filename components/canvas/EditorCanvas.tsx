"use client";

import { useEffect, useCallback } from "react";
import { Point, SpriteFrame, ToolMode } from "../../types";
import {
  drawCheckerboard,
  drawPolygon,
  drawPolyline,
  drawPoint,
  drawCircleLabel,
  getFrameColor,
  getFrameFillColor,
} from "../../utils/canvas";
import { imageToScreen, TransformParams } from "../../utils/geometry";

// ============================================
// Types
// ============================================

interface EditorCanvasProps {
  // Refs
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;

  // Image
  imageSrc: string | null;

  // Frames
  frames: SpriteFrame[];
  selectedFrameId: number | null;
  selectedPointIndex: number | null;

  // Tool
  toolMode: ToolMode;
  currentPoints: Point[];

  // Viewport
  zoom: number;
  pan: Point;
  scale: number;
  canvasHeight: number;

  // Interaction States
  isSpacePressed: boolean;
  isPanning: boolean;
  isDragging: boolean;

  // Event Handlers
  onCanvasClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: () => void;

  // Resize
  onResizeStart: (e: React.MouseEvent) => void;
}

// ============================================
// Component
// ============================================

export default function EditorCanvas({
  canvasRef,
  canvasContainerRef,
  imageRef,
  imageSrc,
  frames,
  selectedFrameId,
  selectedPointIndex,
  toolMode,
  currentPoints,
  zoom,
  pan,
  scale,
  canvasHeight,
  isSpacePressed,
  isPanning,
  isDragging,
  onCanvasClick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onResizeStart,
}: EditorCanvasProps) {
  const transform: TransformParams = { scale, zoom, pan };

  // 캔버스 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    const img = imageRef.current;

    if (!canvas || !container || !img || !imageSrc) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const displayWidth = img.width * scale * zoom;
    const displayHeight = img.height * scale * zoom;

    // 캔버스 크기를 컨테이너에 맞춤
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // 체커보드 배경
    drawCheckerboard(ctx, canvas.width, canvas.height);

    // 이미지 그리기
    ctx.drawImage(img, pan.x, pan.y, displayWidth, displayHeight);

    // 저장된 프레임 폴리곤 그리기
    frames.forEach((frame, idx) => {
      if (frame.points.length < 2) return;

      const isSelected = frame.id === selectedFrameId;
      const screenPoints = frame.points.map((p) => imageToScreen(p.x, p.y, transform));

      // 폴리곤 그리기
      drawPolygon(ctx, screenPoints, {
        fillColor: isSelected ? "rgba(0, 150, 255, 0.25)" : getFrameFillColor(idx),
        strokeColor: isSelected ? "#00aaff" : getFrameColor(idx),
        lineWidth: isSelected ? 3 : 2,
      });

      // 프레임 번호
      const centerX = frame.points.reduce((sum, p) => sum + p.x, 0) / frame.points.length;
      const centerY = frame.points.reduce((sum, p) => sum + p.y, 0) / frame.points.length;
      const centerScreen = imageToScreen(centerX, centerY, transform);

      drawCircleLabel(ctx, centerScreen, String(idx + 1), {
        backgroundColor: isSelected ? "#00aaff" : getFrameColor(idx),
      });

      // 선택된 프레임의 점들 표시
      if (isSelected && toolMode === "select") {
        frame.points.forEach((p, pIdx) => {
          const screen = imageToScreen(p.x, p.y, transform);
          drawPoint(ctx, screen, {
            radius: 7,
            fillColor: pIdx === selectedPointIndex ? "#ff0000" : "#00aaff",
            strokeColor: "#fff",
            strokeWidth: 2,
          });
        });
      }
    });

    // 현재 그리고 있는 폴리곤
    if (currentPoints.length > 0 && toolMode === "pen") {
      const screenPoints = currentPoints.map((p) => imageToScreen(p.x, p.y, transform));

      // 라인 그리기
      if (screenPoints.length >= 2) {
        drawPolyline(ctx, screenPoints, {
          strokeColor: "#00ff00",
          lineWidth: 2,
        });
      }

      // 점들 그리기
      currentPoints.forEach((p, idx) => {
        const screen = imageToScreen(p.x, p.y, transform);
        drawPoint(ctx, screen, {
          radius: 5,
          fillColor: idx === 0 ? "#ff0000" : "#00ff00",
          strokeColor: "#fff",
          strokeWidth: 1,
        });
      });
    }
  }, [
    imageSrc,
    currentPoints,
    frames,
    scale,
    zoom,
    pan,
    selectedFrameId,
    selectedPointIndex,
    toolMode,
    canvasHeight,
    canvasRef,
    canvasContainerRef,
    imageRef,
    transform,
  ]);

  // 커서 스타일 계산
  const getCursorClass = useCallback(() => {
    if (isSpacePressed || toolMode === "hand") {
      return isPanning ? "cursor-grabbing" : "cursor-grab";
    }
    if (toolMode === "pen") {
      return "cursor-crosshair";
    }
    return isDragging ? "cursor-grabbing" : "cursor-default";
  }, [isSpacePressed, toolMode, isPanning, isDragging]);

  return (
    <>
      <div
        ref={canvasContainerRef}
        className="overflow-hidden bg-background"
        style={{ height: canvasHeight }}
      >
        {imageSrc ? (
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            className={`rounded border border-border-default ${getCursorClass()}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-tertiary">
            이미지를 업로드하세요
          </div>
        )}
      </div>

      {/* 리사이즈 핸들 */}
      <div
        onMouseDown={onResizeStart}
        className="h-2 bg-surface-secondary hover:bg-surface-tertiary cursor-ns-resize flex items-center justify-center"
      >
        <div className="w-16 h-1 bg-border-strong rounded" />
      </div>
    </>
  );
}
