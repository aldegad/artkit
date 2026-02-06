"use client";

import { useEffect, useCallback, useState } from "react";
import { useEditor } from "../../domains/sprite/contexts/SpriteEditorContext";
import { useLayout } from "../../domains/sprite/contexts/LayoutContext";
import { useLanguage } from "../../shared/contexts";
import { Scrollbar } from "../../shared/components";
import { ExportDropdown } from "../timeline";
import { getBoundingBox } from "../../utils/geometry";

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
    setIsFrameEditOpen,
  } = useEditor();

  // File drag and drop state
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  const { openFloatingWindow } = useLayout();
  const { t } = useLanguage();

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
          {frames.length > 0 ? `${currentFrameIndex + 1} / ${frames.length}` : t.noFrames}
        </span>

        <div className="divider" />

        {/* Timeline mode buttons */}
        <div className="tool-group">
          <button
            onClick={() => setTimelineMode("reorder")}
            className={`tool-btn ${timelineMode === "reorder" ? "active" : ""}`}
            title={t.reorderMode}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 9l4-4 4 4m0 6l-4 4-4-4"
              />
            </svg>
          </button>
          <button
            onClick={() => setTimelineMode("offset")}
            className={`tool-btn ${timelineMode === "offset" ? "active" : ""}`}
            title={t.offsetMode}
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

        {frames.length > 0 && (
          <ExportDropdown frames={frames} fps={fps} onExportSpriteSheet={exportSpriteSheet} />
        )}
      </div>

      {/* Frame timeline */}
      <Scrollbar className="flex-1">
        <div
          className={`p-3 min-h-full transition-colors ${
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
                  title={t.deleteFrame}
                >
                  ×
                </button>

                {/* Frame image */}
                <div className="checkerboard w-[120px] h-[100px] rounded-lg flex items-center justify-center overflow-hidden">
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
      </Scrollbar>
    </div>
  );
}
