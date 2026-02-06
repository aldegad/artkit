"use client";

import { useCallback, useState } from "react";
import { useEditor } from "../contexts/SpriteEditorContext";
import { useLayout } from "../contexts/LayoutContext";
import { useLanguage } from "../../../shared/contexts";
import { Scrollbar } from "../../../shared/components";
import { SpriteFrame } from "../types";

export default function FrameStrip() {
  const {
    frames,
    setFrames,
    nextFrameId,
    setNextFrameId,
    currentFrameIndex,
    setCurrentFrameIndex,
    selectedFrameId,
    setSelectedFrameId,
    setIsPlaying,
    timelineMode,
    setTimelineMode,
    pushHistory,
    addTrack,
    draggedFrameId,
    setDraggedFrameId,
    dragOverIndex,
    setDragOverIndex,
    editingOffsetFrameId,
    setEditingOffsetFrameId,
    offsetDragStart,
    setOffsetDragStart,
    setIsFrameEditOpen,
    activeTrackId,
  } = useEditor();

  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const { openFloatingWindow } = useLayout();
  const { t } = useLanguage();

  // Timeline drag handlers (reorder)
  const handleDragStart = useCallback(
    (e: React.DragEvent, frameId: number) => {
      setDraggedFrameId(frameId);
      e.dataTransfer.effectAllowed = "move";
    },
    [setDraggedFrameId],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDragOverIndex(index);
    },
    [setDragOverIndex],
  );

  const handleDragLeave = useCallback(() => setDragOverIndex(null), [setDragOverIndex]);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      if (draggedFrameId === null) return;

      const dragIndex = frames.findIndex((f: SpriteFrame) => f.id === draggedFrameId);
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

  const handleDragEnd = useCallback(() => {
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

      setFrames((prev: SpriteFrame[]) =>
        prev.map((frame: SpriteFrame) =>
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
      setFrames((prev: SpriteFrame[]) => prev.filter((f: SpriteFrame) => f.id !== id));
      if (selectedFrameId === id) {
        setSelectedFrameId(null);
      }
    },
    [setFrames, selectedFrameId, setSelectedFrameId],
  );

  // File drag & drop
  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      pushHistory();

      let currentId = nextFrameId;
      const newFrames: SpriteFrame[] = [];

      for (const file of files) {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const imageData = event.target?.result as string;
            const img = new Image();
            img.onload = () => {
              newFrames.push({
                id: currentId,
                points: [
                  { x: 0, y: 0 },
                  { x: img.width, y: 0 },
                  { x: img.width, y: img.height },
                  { x: 0, y: img.height },
                ],
                name: file.name.replace(/\.[^/.]+$/, ""),
                imageData,
                offset: { x: 0, y: 0 },
              });
              currentId++;
              resolve();
            };
            img.src = imageData;
          };
          reader.readAsDataURL(file);
        });
      }

      addTrack("Image Import", newFrames);
      setNextFrameId(currentId);
      setCurrentFrameIndex(0);
    },
    [nextFrameId, setNextFrameId, pushHistory, setCurrentFrameIndex, addTrack],
  );

  if (!activeTrackId) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        트랙을 선택하세요
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-surface-primary"
      onMouseMove={handleOffsetMouseMove}
      onMouseUp={handleOffsetMouseUp}
      onMouseLeave={handleOffsetMouseUp}
    >
      {/* Mini toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-default shrink-0 bg-surface-secondary/50">
        <span className="text-xs text-text-secondary">
          {frames.length > 0 ? `${currentFrameIndex + 1} / ${frames.length}` : "No frames"}
        </span>

        <div className="flex-1" />

        {/* Mode toggle */}
        <div className="flex gap-0.5 bg-surface-tertiary rounded p-0.5">
          <button
            onClick={() => setTimelineMode("reorder")}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              timelineMode === "reorder"
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Reorder
          </button>
          <button
            onClick={() => setTimelineMode("offset")}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              timelineMode === "offset"
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Offset
          </button>
        </div>
      </div>

      {/* Frame strip */}
      <Scrollbar className="flex-1">
        <div
          className={`p-2 min-h-full transition-colors ${
            isFileDragOver ? "bg-accent-primary/10 ring-2 ring-accent-primary ring-inset" : ""
          }`}
          onDragOver={handleFileDragOver}
          onDragLeave={handleFileDragLeave}
          onDrop={handleFileDrop}
        >
          <div className="flex items-start gap-2 min-h-full">
            {frames.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-xs h-24 text-text-tertiary">
                {isFileDragOver ? (
                  <span className="text-accent-primary font-medium">Drop images here</span>
                ) : (
                  <span>Drag images here or import frames</span>
                )}
              </div>
            ) : (
              frames.map((frame: SpriteFrame, idx: number) => (
                <div
                  key={frame.id}
                  draggable={timelineMode === "reorder"}
                  onDragStart={(e) => timelineMode === "reorder" && handleDragStart(e, frame.id)}
                  onDragOver={(e) => timelineMode === "reorder" && handleDragOver(e, idx)}
                  onDragLeave={timelineMode === "reorder" ? handleDragLeave : undefined}
                  onDrop={(e) => timelineMode === "reorder" && handleDrop(e, idx)}
                  onDragEnd={timelineMode === "reorder" ? handleDragEnd : undefined}
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
                    relative shrink-0 rounded-lg border-2 transition-all
                    ${timelineMode === "reorder" ? "cursor-grab active:cursor-grabbing" : "cursor-move"}
                    ${idx === currentFrameIndex ? "border-accent-primary shadow-sm" : "border-border-default"}
                    ${dragOverIndex === idx ? "border-accent-primary! scale-105" : ""}
                    ${draggedFrameId === frame.id ? "opacity-50" : ""}
                    ${editingOffsetFrameId === frame.id ? "border-accent-warning!" : ""}
                  `}
                >
                  {/* Frame number */}
                  <div
                    className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold z-10 text-white"
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
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-accent-danger hover:bg-accent-danger-hover rounded-full flex items-center justify-center text-[9px] z-10 text-white transition-all hover:scale-110"
                    title={t.deleteFrame}
                  >
                    ×
                  </button>

                  {/* Frame image */}
                  <div className="checkerboard w-[80px] h-[64px] rounded flex items-center justify-center overflow-hidden">
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
                    <div className="absolute bottom-0 left-0 right-0 bg-surface-tertiary/90 text-[8px] text-center py-0.5 rounded-b text-text-secondary font-mono">
                      {frame.offset.x},{frame.offset.y}
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
