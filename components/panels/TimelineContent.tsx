"use client";

import { useEffect, useCallback, useState } from "react";
import { useEditor } from "../../contexts/EditorContext";
import { useLayout } from "../../contexts/LayoutContext";
import { Point } from "../../types";
import {
  downloadFramesAsZip,
  downloadSpriteSheet,
  downloadFullProject,
  downloadProjectMetadata,
} from "../../utils/export";

// ============================================
// Export Dropdown Component
// ============================================

interface ExportDropdownProps {
  frames: { id: number; points: Point[]; name: string; imageData?: string; offset: Point }[];
  fps: number;
  onExportSpriteSheet: () => void;
}

function ExportDropdown({ frames, fps, onExportSpriteSheet }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const projectName = "sprite-project"; // TODO: Get from context

  const handleExport = async (type: string) => {
    setIsExporting(true);
    try {
      switch (type) {
        case "spritesheet":
          onExportSpriteSheet();
          break;
        case "zip":
          await downloadFramesAsZip(frames, projectName);
          break;
        case "spritesheet-new":
          await downloadSpriteSheet(frames, projectName);
          break;
        case "full":
          await downloadFullProject(frames, projectName, fps);
          break;
        case "metadata":
          downloadProjectMetadata(frames, projectName, fps);
          break;
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("내보내기 실패: " + (error as Error).message);
    } finally {
      setIsExporting(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="btn btn-primary text-sm"
      >
        {isExporting ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            내보내는 중...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            내보내기
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Dropdown menu */}
          <div className="absolute right-0 top-full mt-1 bg-surface-secondary border border-border-default rounded-lg shadow-xl z-50 min-w-[200px] py-1">
            <button
              onClick={() => handleExport("zip")}
              className="w-full px-4 py-2 text-left text-sm hover:bg-interactive-hover flex items-center gap-2 text-text-primary"
            >
              <span className="text-accent-primary">📦</span>
              <div>
                <div>PNG ZIP 다운로드</div>
                <div className="text-xs text-text-tertiary">개별 프레임 파일들</div>
              </div>
            </button>

            <button
              onClick={() => handleExport("spritesheet-new")}
              className="w-full px-4 py-2 text-left text-sm hover:bg-interactive-hover flex items-center gap-2 text-text-primary"
            >
              <span className="text-accent-primary">🖼️</span>
              <div>
                <div>스프라이트 시트</div>
                <div className="text-xs text-text-tertiary">한 장에 모든 프레임</div>
              </div>
            </button>

            <div className="border-t border-border-default my-1" />

            <button
              onClick={() => handleExport("full")}
              className="w-full px-4 py-2 text-left text-sm hover:bg-interactive-hover flex items-center gap-2 text-text-primary"
            >
              <span className="text-accent-warning">📁</span>
              <div>
                <div>전체 프로젝트 (ZIP)</div>
                <div className="text-xs text-text-tertiary">이미지 + 메타데이터</div>
              </div>
            </button>

            <button
              onClick={() => handleExport("metadata")}
              className="w-full px-4 py-2 text-left text-sm hover:bg-interactive-hover flex items-center gap-2 text-text-primary"
            >
              <span className="text-accent-primary">📋</span>
              <div>
                <div>메타데이터 (JSON)</div>
                <div className="text-xs text-text-tertiary">게임 통합용 데이터</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function getBoundingBox(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

// ============================================
// Component
// ============================================

export default function TimelineContent() {
  const {
    frames,
    setFrames,
    nextFrameId,
    setNextFrameId,
    currentFrameIndex,
    setCurrentFrameIndex,
    selectedFrameId,
    setSelectedFrameId,
    isPlaying,
    setIsPlaying,
    fps,
    setFps,
    timelineMode,
    setTimelineMode,
    zoom,
    setZoom,
    setPan,
    isBackgroundRemovalMode,
    setIsBackgroundRemovalMode,
    eraserTolerance,
    setEraserTolerance,
    eraserMode,
    setEraserMode,
    pushHistory,
    draggedFrameId,
    setDraggedFrameId,
    dragOverIndex,
    setDragOverIndex,
    editingOffsetFrameId,
    setEditingOffsetFrameId,
    offsetDragStart,
    setOffsetDragStart,
    previewCanvasRef,
    animationRef,
    lastFrameTimeRef,
    setIsPreviewWindowOpen,
    setIsFrameEditOpen,
    imageRef,
  } = useEditor();

  // File drag and drop state
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  const { openFloatingWindow } = useLayout();

  // Preview frame drawing
  const drawPreviewFrame = useCallback(
    (frameIndex: number) => {
      if (!previewCanvasRef.current || frames.length === 0) return;

      const frame = frames[frameIndex];
      if (!frame?.imageData) return;

      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        const maxSize = 150;
        const frameScale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * frameScale;
        canvas.height = img.height * frameScale;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          img,
          frame.offset.x * frameScale,
          frame.offset.y * frameScale,
          canvas.width,
          canvas.height,
        );
      };
      img.src = frame.imageData;
    },
    [frames, previewCanvasRef],
  );

  // Animation loop
  useEffect(() => {
    if (!isPlaying || frames.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const frameDuration = 1000 / fps;

    const animate = (timestamp: number) => {
      if (timestamp - lastFrameTimeRef.current >= frameDuration) {
        lastFrameTimeRef.current = timestamp;
        setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, fps, frames.length, animationRef, lastFrameTimeRef, setCurrentFrameIndex]);

  useEffect(() => {
    drawPreviewFrame(currentFrameIndex);
  }, [currentFrameIndex, drawPreviewFrame]);

  // Timeline drag handlers
  const handleTimelineDragStart = useCallback(
    (e: React.DragEvent, frameId: number) => {
      setDraggedFrameId(frameId);
      e.dataTransfer.effectAllowed = "move";
    },
    [setDraggedFrameId],
  );

  const handleTimelineDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDragOverIndex(index);
    },
    [setDragOverIndex],
  );

  const handleTimelineDragLeave = useCallback(() => setDragOverIndex(null), [setDragOverIndex]);

  const handleTimelineDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      if (draggedFrameId === null) return;

      const dragIndex = frames.findIndex((f) => f.id === draggedFrameId);
      if (dragIndex === -1 || dragIndex === dropIndex) {
        setDraggedFrameId(null);
        setDragOverIndex(null);
        return;
      }

      const newFrames = [...frames];
      const [draggedFrame] = newFrames.splice(dragIndex, 1);
      newFrames.splice(dropIndex, 0, draggedFrame);

      setFrames(newFrames);
      setDraggedFrameId(null);
      setDragOverIndex(null);
    },
    [draggedFrameId, frames, setFrames, setDraggedFrameId, setDragOverIndex],
  );

  const handleTimelineDragEnd = useCallback(() => {
    setDraggedFrameId(null);
    setDragOverIndex(null);
  }, [setDraggedFrameId, setDragOverIndex]);

  // Offset drag handlers
  const handleOffsetMouseDown = useCallback(
    (e: React.MouseEvent, frameId: number) => {
      e.stopPropagation();
      setEditingOffsetFrameId(frameId);
      setOffsetDragStart({ x: e.clientX, y: e.clientY });
    },
    [setEditingOffsetFrameId, setOffsetDragStart],
  );

  const handleOffsetMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (editingOffsetFrameId === null) return;

      const dx = e.clientX - offsetDragStart.x;
      const dy = e.clientY - offsetDragStart.y;

      setFrames((prev) =>
        prev.map((frame) =>
          frame.id === editingOffsetFrameId
            ? { ...frame, offset: { x: frame.offset.x + dx, y: frame.offset.y + dy } }
            : frame,
        ),
      );
      setOffsetDragStart({ x: e.clientX, y: e.clientY });
    },
    [editingOffsetFrameId, offsetDragStart, setFrames, setOffsetDragStart],
  );

  const handleOffsetMouseUp = useCallback(() => {
    setEditingOffsetFrameId(null);
  }, [setEditingOffsetFrameId]);

  // Delete frame
  const deleteFrame = useCallback(
    (id: number) => {
      setFrames((prev) => prev.filter((f) => f.id !== id));
      if (selectedFrameId === id) {
        setSelectedFrameId(null);
      }
    },
    [setFrames, selectedFrameId, setSelectedFrameId],
  );

  // Reset frame image to original (re-extract from source image)
  const resetFrameImage = useCallback(
    (frameId: number) => {
      const frame = frames.find((f) => f.id === frameId);
      if (!frame || !imageRef.current) return;

      // Save history before modification
      pushHistory();

      const img = imageRef.current;
      const points = frame.points;

      if (points.length < 3) return;

      // Calculate bounding box
      const bbox = getBoundingBox(points);
      const width = bbox.maxX - bbox.minX;
      const height = bbox.maxY - bbox.minY;

      // Create canvas and extract image
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const ctx = tempCanvas.getContext("2d");
      if (!ctx) return;

      // Apply polygon clip
      ctx.beginPath();
      ctx.moveTo(points[0].x - bbox.minX, points[0].y - bbox.minY);
      points.slice(1).forEach((p) => {
        ctx.lineTo(p.x - bbox.minX, p.y - bbox.minY);
      });
      ctx.closePath();
      ctx.clip();

      // Draw original image
      ctx.drawImage(img, bbox.minX, bbox.minY, width, height, 0, 0, width, height);

      const newImageData = tempCanvas.toDataURL("image/png");

      setFrames((prev) =>
        prev.map((f) => (f.id === frameId ? { ...f, imageData: newImageData } : f)),
      );
    },
    [frames, imageRef, pushHistory, setFrames],
  );

  // Remove background with edge feathering
  const removeBackgroundFromThumb = useCallback(
    (frameId: number, clickX: number, clickY: number, frame: (typeof frames)[0]) => {
      if (!frame.imageData) return;

      // Save history before modification
      pushHistory();

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
        const width = canvas.width;
        const height = canvas.height;

        const bbox = getBoundingBox(frame.points);
        const localX = Math.round(clickX - bbox.minX);
        const localY = Math.round(clickY - bbox.minY);

        if (localX < 0 || localX >= width || localY < 0 || localY >= height) return;

        const startIdx = (localY * width + localX) * 4;
        const targetR = data[startIdx];
        const targetG = data[startIdx + 1];
        const targetB = data[startIdx + 2];
        const targetA = data[startIdx + 3];

        if (targetA === 0) return;

        // 색상 거리 계산 (Euclidean distance - 더 정확한 색상 비교)
        const colorDistance = (idx: number): number => {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          return Math.sqrt(
            Math.pow(r - targetR, 2) + Math.pow(g - targetG, 2) + Math.pow(b - targetB, 2),
          );
        };

        const colorMatch = (idx: number): boolean => {
          const a = data[idx + 3];
          if (a === 0) return false;
          return colorDistance(idx) <= eraserTolerance * 1.5; // Euclidean에 맞게 스케일 조정
        };

        // 삭제된 픽셀 추적
        const removedPixels = new Set<number>();

        if (eraserMode === "all") {
          // "전체 색상" 모드: 이미지 전체에서 같은 색상 삭제
          for (let i = 0; i < data.length; i += 4) {
            if (colorMatch(i)) {
              data[i + 3] = 0;
              removedPixels.add(i / 4);
            }
          }
        } else {
          // "연결된 영역만" 모드: Flood Fill (BFS)
          const visited = new Set<number>();
          const queue: number[] = [localY * width + localX];
          visited.add(queue[0]);

          while (queue.length > 0) {
            const pos = queue.shift()!;
            const x = pos % width;
            const y = Math.floor(pos / width);
            const idx = pos * 4;

            if (colorMatch(idx)) {
              data[idx + 3] = 0;
              removedPixels.add(pos);

              const neighbors = [
                { nx: x - 1, ny: y },
                { nx: x + 1, ny: y },
                { nx: x, ny: y - 1 },
                { nx: x, ny: y + 1 },
              ];

              for (const { nx, ny } of neighbors) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  const nPos = ny * width + nx;
                  if (!visited.has(nPos)) {
                    visited.add(nPos);
                    queue.push(nPos);
                  }
                }
              }
            }
          }
        }

        // Edge Feathering: 경계 픽셀 부드럽게 처리
        const featherRadius = 2;
        const edgePixels: Array<{ x: number; y: number; distToRemoved: number }> = [];

        // 경계 픽셀 찾기 (삭제되지 않았지만 삭제된 픽셀과 인접한 픽셀)
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const pos = y * width + x;
            const idx = pos * 4;

            // 이미 투명하면 스킵
            if (data[idx + 3] === 0) continue;

            // 주변에 삭제된 픽셀이 있는지 확인
            let minDist = Infinity;
            for (let dy = -featherRadius; dy <= featherRadius; dy++) {
              for (let dx = -featherRadius; dx <= featherRadius; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  const nPos = ny * width + nx;
                  if (removedPixels.has(nPos)) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    minDist = Math.min(minDist, dist);
                  }
                }
              }
            }

            if (minDist <= featherRadius) {
              edgePixels.push({ x, y, distToRemoved: minDist });
            }
          }
        }

        // 경계 픽셀에 페더링 적용
        for (const { x, y, distToRemoved } of edgePixels) {
          const idx = (y * width + x) * 4;
          const currentAlpha = data[idx + 3];

          // 거리가 가까울수록 더 투명하게
          const featherFactor = distToRemoved / featherRadius;
          const newAlpha = Math.round(currentAlpha * featherFactor);
          data[idx + 3] = newAlpha;

          // Color decontamination: 배경색 영향 제거
          // 반투명 픽셀의 색상에서 배경색 성분을 줄임
          if (newAlpha > 0 && newAlpha < 255) {
            const bgInfluence = 1 - featherFactor;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // 배경색 성분 제거 (간단한 방식)
            data[idx] = Math.min(255, Math.round(r + (r - targetR) * bgInfluence * 0.5));
            data[idx + 1] = Math.min(255, Math.round(g + (g - targetG) * bgInfluence * 0.5));
            data[idx + 2] = Math.min(255, Math.round(b + (b - targetB) * bgInfluence * 0.5));
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
    [eraserTolerance, eraserMode, setFrames, pushHistory],
  );

  // ============================================
  // File Drag & Drop for adding frames directly
  // ============================================

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if files are being dragged (not frame reordering)
    if (e.dataTransfer.types.includes("Files")) {
      setIsFileDragOver(true);
    }
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFileDragOver(false);
  }, []);

  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(false);

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/"),
      );

      if (files.length === 0) return;

      // Sort files by name for proper ordering (coin0.png, coin1.png, etc.)
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      pushHistory();

      let currentId = nextFrameId;

      for (const file of files) {
        const reader = new FileReader();

        await new Promise<void>((resolve) => {
          reader.onload = (event) => {
            const imageData = event.target?.result as string;

            // Create image to get dimensions
            const img = new Image();
            img.onload = () => {
              const width = img.width;
              const height = img.height;

              // Create frame with the image - using full image bounds as points
              const newFrame = {
                id: currentId,
                points: [
                  { x: 0, y: 0 },
                  { x: width, y: 0 },
                  { x: width, y: height },
                  { x: 0, y: height },
                ],
                name: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
                imageData,
                offset: { x: 0, y: 0 },
              };

              setFrames((prev) => [...prev, newFrame]);
              currentId++;
              setNextFrameId(currentId);
              resolve();
            };
            img.src = imageData;
          };
          reader.readAsDataURL(file);
        });
      }

      // Select the first added frame
      setCurrentFrameIndex(frames.length);
    },
    [nextFrameId, setNextFrameId, setFrames, pushHistory, frames.length, setCurrentFrameIndex],
  );

  // Export sprite sheet
  const exportSpriteSheet = useCallback(() => {
    if (frames.length === 0) return;

    let maxWidth = 0;
    let maxHeight = 0;
    frames.forEach((frame) => {
      const bbox = getBoundingBox(frame.points);
      maxWidth = Math.max(maxWidth, bbox.maxX - bbox.minX);
      maxHeight = Math.max(maxHeight, bbox.maxY - bbox.minY);
    });

    const sheetCanvas = document.createElement("canvas");
    sheetCanvas.width = maxWidth * frames.length;
    sheetCanvas.height = maxHeight;
    const sheetCtx = sheetCanvas.getContext("2d");
    if (!sheetCtx) return;

    let loadedCount = 0;
    frames.forEach((frame, idx) => {
      if (!frame.imageData) return;

      const img = new Image();
      img.onload = () => {
        const offsetX = idx * maxWidth + (maxWidth - img.width) / 2 + frame.offset.x;
        const offsetY = (maxHeight - img.height) / 2 + frame.offset.y;
        sheetCtx.drawImage(img, offsetX, offsetY);

        loadedCount++;
        if (loadedCount === frames.length) {
          const link = document.createElement("a");
          link.download = "spritesheet.png";
          link.href = sheetCanvas.toDataURL("image/png");
          link.click();
        }
      };
      img.src = frame.imageData;
    });
  }, [frames]);

  return (
    <div
      className="flex flex-col h-full bg-surface-primary timeline-bar"
      onMouseMove={handleOffsetMouseMove}
      onMouseUp={handleOffsetMouseUp}
      onMouseLeave={handleOffsetMouseUp}
    >
      {/* Control bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border-default shrink-0 bg-surface-secondary/50">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={frames.length === 0}
          className="btn btn-primary text-sm"
        >
          {isPlaying ? "⏹ 정지" : "▶ 재생"}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">FPS:</span>
          <input
            type="range"
            min={1}
            max={60}
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value))}
            className="w-24"
          />
          <span className="text-xs text-text-primary w-6">{fps}</span>
        </div>

        <div className="divider" />

        {/* Preview */}
        <div className="checkerboard w-16 h-16 rounded flex items-center justify-center overflow-hidden border border-border-default">
          {frames.length > 0 ? (
            <canvas ref={previewCanvasRef} className="max-w-full max-h-full" />
          ) : (
            <span className="text-text-tertiary text-xs">-</span>
          )}
        </div>

        <span className="text-xs text-text-secondary">
          {frames.length > 0 ? `${currentFrameIndex + 1} / ${frames.length}` : "프레임 없음"}
        </span>

        <div className="divider" />

        {/* Timeline mode buttons */}
        <div className="tool-group">
          <button
            onClick={() => setTimelineMode("reorder")}
            className={`tool-btn ${timelineMode === "reorder" ? "active" : ""}`}
            title="순서 변경 모드"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 9l4-4 4 4m0 6l-4 4-4-4"
              />
            </svg>
            순서
          </button>
          <button
            onClick={() => setTimelineMode("offset")}
            className={`tool-btn ${timelineMode === "offset" ? "active" : ""}`}
            title="위치 조정 모드"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7"
              />
            </svg>
            위치
          </button>
        </div>

        <div className="flex-1" />

        {/* Zoom slider */}
        <div className="flex items-center gap-2 bg-surface-secondary rounded-full px-2 py-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))}
            className="w-7 h-7 flex items-center justify-center hover:bg-interactive-hover rounded-full text-sm font-medium transition-colors"
          >
            −
          </button>
          <input
            type="range"
            min={10}
            max={300}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(parseInt(e.target.value) / 100)}
            className="w-20"
          />
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
            className="w-7 h-7 flex items-center justify-center hover:bg-interactive-hover rounded-full text-sm font-medium transition-colors"
          >
            +
          </button>
          <span className="text-xs text-text-secondary w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="btn btn-ghost text-xs px-2 py-1"
          >
            Reset
          </button>
        </div>

        <div className="divider" />

        {/* Preview window buttons */}
        <button
          onClick={() => {
            setIsPreviewWindowOpen(true);
            openFloatingWindow("preview", { x: 100, y: 100 });
          }}
          disabled={frames.length === 0}
          className="btn btn-primary text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          애니메이션
        </button>
        <button
          onClick={() => {
            setIsFrameEditOpen(true);
            openFloatingWindow("frame-edit", { x: 150, y: 150 });
          }}
          disabled={frames.length === 0}
          className="btn btn-secondary text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
            />
          </svg>
          프레임
        </button>

        {frames.length > 0 && (
          <ExportDropdown frames={frames} fps={fps} onExportSpriteSheet={exportSpriteSheet} />
        )}

        <div className="divider" />

        {/* Background removal controls */}
        <button
          onClick={() => setIsBackgroundRemovalMode(!isBackgroundRemovalMode)}
          className={`btn ${isBackgroundRemovalMode ? "btn-danger" : "btn-ghost"}`}
          title={isBackgroundRemovalMode ? "배경삭제 모드 종료" : "프레임 클릭 시 배경 제거"}
        >
          {isBackgroundRemovalMode ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              닫기
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
              배경삭제
            </>
          )}
        </button>

        {isBackgroundRemovalMode && (
          <>
            <div className="tool-group">
              <button
                onClick={() => setEraserMode("connected")}
                className={`tool-btn ${eraserMode === "connected" ? "active" : ""}`}
                title="클릭한 위치에서 연결된 영역만 삭제"
              >
                연결만
              </button>
              <button
                onClick={() => setEraserMode("all")}
                className={`tool-btn ${eraserMode === "all" ? "active" : ""}`}
                title="이미지 전체에서 같은 색상 모두 삭제"
              >
                전체색상
              </button>
            </div>
            <div className="flex items-center gap-2 bg-surface-secondary rounded-full px-3 py-1.5">
              <span className="text-xs text-text-secondary font-medium">허용치:</span>
              <input
                type="range"
                min={0}
                max={128}
                value={eraserTolerance}
                onChange={(e) => setEraserTolerance(parseInt(e.target.value))}
                className="w-16"
              />
              <span className="text-xs text-text-primary font-semibold w-6">{eraserTolerance}</span>
            </div>
          </>
        )}
      </div>

      {/* Background removal mode indicator */}
      {isBackgroundRemovalMode && frames.length > 0 && (
        <div className="bg-pink-600/90 text-white text-center py-2 text-sm font-medium flex items-center justify-center gap-4">
          <span className="flex items-center gap-2">
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
            클릭: 배경 제거
          </span>
          <span className="text-yellow-300 flex items-center gap-1">
            <span className="w-4 h-4 bg-yellow-600 rounded-full flex items-center justify-center text-[10px]">
              ↻
            </span>
            원본 복원
          </span>
        </div>
      )}

      {/* Frame timeline */}
      <div
        className={`flex-1 overflow-y-auto overflow-x-auto p-3 transition-colors ${
          isFileDragOver ? "bg-accent-primary/10 ring-2 ring-accent-primary ring-inset" : ""
        }`}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        onDrop={handleFileDrop}
      >
        <div className="flex items-start gap-3 min-h-full">
          {frames.length === 0 ? (
            <div
              className={`flex-1 flex flex-col items-center justify-center text-sm h-32 ${
                isFileDragOver ? "text-accent-primary" : "text-text-tertiary"
              }`}
            >
              {isFileDragOver ? (
                <>
                  <svg
                    className="w-8 h-8 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <span className="font-medium">이미지를 놓아서 프레임 추가</span>
                </>
              ) : (
                <>
                  <span>이미지에서 폴리곤을 그려 프레임을 추가하세요</span>
                  <span className="text-xs mt-1">또는 이미지 파일을 여기에 드래그&드롭</span>
                </>
              )}
            </div>
          ) : (
            frames.map((frame, idx) => (
              <div
                key={frame.id}
                draggable={timelineMode === "reorder"}
                onDragStart={(e) =>
                  timelineMode === "reorder" && handleTimelineDragStart(e, frame.id)
                }
                onDragOver={(e) => timelineMode === "reorder" && handleTimelineDragOver(e, idx)}
                onDragLeave={timelineMode === "reorder" ? handleTimelineDragLeave : undefined}
                onDrop={(e) => timelineMode === "reorder" && handleTimelineDrop(e, idx)}
                onDragEnd={timelineMode === "reorder" ? handleTimelineDragEnd : undefined}
                onMouseDown={(e) => timelineMode === "offset" && handleOffsetMouseDown(e, frame.id)}
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentFrameIndex(idx);
                  setSelectedFrameId(frame.id);
                }}
                onDoubleClick={() => {
                  setCurrentFrameIndex(idx);
                  setIsFrameEditOpen(true);
                  openFloatingWindow("frame-edit", { x: 150, y: 150 });
                }}
                className={`
                  frame-thumb shrink-0
                  ${timelineMode === "reorder" ? "cursor-grab active:cursor-grabbing" : "cursor-move"}
                  ${idx === currentFrameIndex ? "selected" : ""}
                  ${dragOverIndex === idx ? "border-accent-primary! scale-105" : ""}
                  ${draggedFrameId === frame.id ? "opacity-50" : ""}
                  ${editingOffsetFrameId === frame.id ? "border-accent-warning!" : ""}
                `}
              >
                {/* Frame number */}
                <div
                  className="absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold z-10"
                  style={{ backgroundColor: `hsl(${(idx * 60) % 360}, 70%, 50%)` }}
                >
                  {idx + 1}
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFrame(frame.id);
                  }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-accent-danger hover:bg-accent-danger-hover rounded-full flex items-center justify-center text-xs z-10 text-white transition-all hover:scale-110 shadow-sm"
                  title="프레임 삭제"
                >
                  ×
                </button>

                {/* Reset button - 배경 삭제 모드일 때 표시 */}
                {isBackgroundRemovalMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      resetFrameImage(frame.id);
                    }}
                    className="absolute -top-2 right-5 w-5 h-5 bg-accent-warning hover:bg-accent-warning-hover rounded-full flex items-center justify-center text-xs z-10 text-white transition-all hover:scale-110 shadow-sm"
                    title="원본으로 초기화"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </button>
                )}

                {/* Frame image */}
                <div
                  className={`checkerboard w-[120px] h-[100px] rounded-lg flex items-center justify-center overflow-hidden ${
                    isBackgroundRemovalMode ? "ring-2 ring-accent-danger ring-opacity-50" : ""
                  }`}
                  style={{
                    cursor: isBackgroundRemovalMode ? "crosshair" : undefined,
                  }}
                  onClick={(e) => {
                    if (isBackgroundRemovalMode && frame.imageData) {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const clickY = e.clientY - rect.top;

                      const img = new Image();
                      img.onload = () => {
                        const thumbSize = 96;
                        const scaleX = img.width / Math.min(thumbSize, img.width);
                        const scaleY = img.height / Math.min(thumbSize, img.height);
                        const scaleVal = Math.max(scaleX, scaleY);

                        const displayW = img.width / scaleVal;
                        const displayH = img.height / scaleVal;
                        const offsetX = (thumbSize - displayW) / 2;
                        const offsetY = (thumbSize - displayH) / 2;

                        const imgX = (clickX - offsetX) * scaleVal;
                        const imgY = (clickY - offsetY) * scaleVal;

                        const bbox = getBoundingBox(frame.points);
                        removeBackgroundFromThumb(
                          frame.id,
                          bbox.minX + imgX,
                          bbox.minY + imgY,
                          frame,
                        );
                      };
                      img.src = frame.imageData;
                    }
                  }}
                >
                  {frame.imageData && (
                    <img
                      src={frame.imageData}
                      alt={frame.name}
                      className="max-w-full max-h-full object-contain"
                      style={{
                        transform: `translate(${frame.offset.x}px, ${frame.offset.y}px)`,
                      }}
                      draggable={false}
                    />
                  )}
                </div>

                {/* Offset display */}
                {(frame.offset.x !== 0 || frame.offset.y !== 0) && (
                  <div className="absolute bottom-0 left-0 right-0 bg-surface-tertiary/90 text-[10px] text-center py-0.5 rounded-b text-text-secondary font-mono">
                    {frame.offset.x}, {frame.offset.y}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
