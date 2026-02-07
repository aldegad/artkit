"use client";

import { useCallback, useState } from "react";
import { useEditor } from "../contexts/SpriteEditorContext";
import { useLayout } from "../contexts/LayoutContext";
import { useLanguage } from "../../../shared/contexts";
import { Scrollbar } from "../../../shared/components";
import { DeleteIcon, EyeOpenIcon, EyeClosedIcon } from "../../../shared/components/icons";
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
    selectedFrameIds,
    setSelectedFrameIds,
    toggleSelectedFrameId,
    selectFrameRange,
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
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showNthPopover, setShowNthPopover] = useState(false);
  const [nthValue, setNthValue] = useState(2);
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

  // Delete active frame
  const deleteActiveFrame = useCallback(() => {
    if (frames.length === 0) return;
    const frame = frames[currentFrameIndex];
    if (!frame) return;
    pushHistory();
    setFrames((prev: SpriteFrame[]) => prev.filter((f: SpriteFrame) => f.id !== frame.id));
    if (selectedFrameId === frame.id) {
      setSelectedFrameId(null);
    }
    if (currentFrameIndex >= frames.length - 1 && currentFrameIndex > 0) {
      setCurrentFrameIndex(currentFrameIndex - 1);
    }
  }, [frames, currentFrameIndex, setFrames, selectedFrameId, setSelectedFrameId, pushHistory, setCurrentFrameIndex]);

  // Nth reset: keep only every nth frame starting from active
  const applyNthReset = useCallback(() => {
    if (frames.length === 0 || nthValue < 1) return;
    pushHistory();
    const startIndex = currentFrameIndex;
    const newFrames = frames.filter((_: SpriteFrame, idx: number) => {
      const relativeIdx = idx - startIndex;
      if (relativeIdx < 0) return true; // keep frames before start
      return relativeIdx % nthValue === 0;
    });
    setFrames(newFrames);
    setCurrentFrameIndex(Math.min(startIndex, newFrames.length - 1));
    setShowNthPopover(false);
  }, [frames, currentFrameIndex, nthValue, pushHistory, setFrames, setCurrentFrameIndex]);

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

  // Determine which frames to display
  const displayFrames = showActiveOnly
    ? frames.length > 0
      ? [{ frame: frames[currentFrameIndex], originalIndex: currentFrameIndex }]
      : []
    : frames.map((frame: SpriteFrame, idx: number) => ({ frame, originalIndex: idx }));

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
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border-default shrink-0 bg-surface-secondary/50">
        {/* Frame indicator */}
        <span className="text-xs text-text-secondary font-mono tabular-nums">
          {frames.length > 0 ? `${currentFrameIndex + 1} / ${frames.length}` : "0"}
          {selectedFrameIds.length > 1 && (
            <span className="text-accent-primary ml-1">({selectedFrameIds.length} sel)</span>
          )}
        </span>

        <div className="flex-1" />

        {/* Show active only toggle */}
        <button
          onClick={() => setShowActiveOnly(!showActiveOnly)}
          className={`p-1 rounded transition-colors ${
            showActiveOnly
              ? "bg-accent-primary/15 text-accent-primary"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
          title={showActiveOnly ? "모든 프레임 보기" : "활성 프레임만 보기"}
        >
          {showActiveOnly ? (
            <EyeClosedIcon className="w-3.5 h-3.5" />
          ) : (
            <EyeOpenIcon className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Nth reset */}
        <div className="relative">
          <button
            onClick={() => setShowNthPopover(!showNthPopover)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              showNthPopover
                ? "bg-accent-primary/15 text-accent-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
            title="N번째 프레임만 유지"
          >
            Nth
          </button>
          {showNthPopover && (
            <div className="absolute right-0 top-full mt-1 bg-surface-secondary border border-border-default rounded-lg shadow-lg p-2 z-20 min-w-[160px]">
              <div className="text-[10px] text-text-secondary mb-1.5">
                현재 프레임부터 매 N번째만 유지
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={2}
                  max={frames.length}
                  value={nthValue}
                  onChange={(e) => setNthValue(Math.max(2, Number(e.target.value)))}
                  className="w-12 px-1.5 py-0.5 bg-surface-tertiary border border-border-default rounded text-[11px] text-text-primary text-center"
                />
                <button
                  onClick={applyNthReset}
                  className="flex-1 px-2 py-0.5 bg-accent-primary hover:bg-accent-primary-hover text-white rounded text-[10px] transition-colors"
                >
                  적용
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Delete active frame */}
        <button
          onClick={deleteActiveFrame}
          disabled={frames.length === 0}
          className="p-1 rounded text-text-tertiary hover:text-accent-danger disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={t.deleteFrame}
        >
          <DeleteIcon className="w-3.5 h-3.5" />
        </button>

        {/* Separator */}
        <div className="w-px h-4 bg-border-default" />

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
      <Scrollbar className="flex-1" overflow={{ x: "hidden", y: "scroll" }}>
        <div
          className={`p-2 min-h-full transition-colors ${
            isFileDragOver ? "bg-accent-primary/10 ring-2 ring-accent-primary ring-inset" : ""
          }`}
          onDragOver={handleFileDragOver}
          onDragLeave={handleFileDragLeave}
          onDrop={handleFileDrop}
        >
          <div className="grid gap-2 min-h-full" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
            {displayFrames.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center text-xs h-24 text-text-tertiary">
                {isFileDragOver ? (
                  <span className="text-accent-primary font-medium">Drop images here</span>
                ) : (
                  <span>Drag images here or import frames</span>
                )}
              </div>
            ) : (
              displayFrames.map(({ frame, originalIndex: idx }: { frame: SpriteFrame; originalIndex: number }) => (
                <div
                  key={frame.id}
                  draggable={timelineMode === "reorder" && !showActiveOnly}
                  onDragStart={(e) => timelineMode === "reorder" && !showActiveOnly && handleDragStart(e, frame.id)}
                  onDragOver={(e) => timelineMode === "reorder" && !showActiveOnly && handleDragOver(e, idx)}
                  onDragLeave={timelineMode === "reorder" && !showActiveOnly ? handleDragLeave : undefined}
                  onDrop={(e) => timelineMode === "reorder" && !showActiveOnly && handleDrop(e, idx)}
                  onDragEnd={timelineMode === "reorder" && !showActiveOnly ? handleDragEnd : undefined}
                  onMouseDown={(e) => timelineMode === "offset" && handleOffsetMouseDown(e, frame.id)}
                  onClick={(e) => {
                    setIsPlaying(false);
                    if (e.shiftKey && selectedFrameId !== null) {
                      // Shift+Click: range select from last selected to current
                      selectFrameRange(selectedFrameId, frame.id);
                    } else if (e.ctrlKey || e.metaKey) {
                      // Ctrl/Cmd+Click: toggle individual selection
                      toggleSelectedFrameId(frame.id);
                    } else {
                      // Normal click: single select
                      setSelectedFrameIds([frame.id]);
                    }
                    setCurrentFrameIndex(idx);
                    setSelectedFrameId(frame.id);
                  }}
                  onDoubleClick={() => {
                    setCurrentFrameIndex(idx);
                    setIsFrameEditOpen(true);
                    openFloatingWindow("frame-edit", { x: 150, y: 150 });
                  }}
                  className={`
                    relative rounded-lg border-2 transition-all
                    ${timelineMode === "reorder" ? "cursor-grab active:cursor-grabbing" : "cursor-move"}
                    ${idx === currentFrameIndex ? "border-accent-primary shadow-sm" : selectedFrameIds.includes(frame.id) ? "border-accent-primary/50 bg-accent-primary/10" : "border-border-default"}
                    ${dragOverIndex === idx ? "border-accent-primary! scale-105" : ""}
                    ${draggedFrameId === frame.id ? "opacity-50" : ""}
                    ${editingOffsetFrameId === frame.id ? "border-accent-warning!" : ""}
                  `}
                >
                  {/* Frame number - only on active frame, monotone */}
                  {idx === currentFrameIndex && (
                    <div className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold z-10 bg-text-primary text-surface-primary">
                      {idx + 1}
                    </div>
                  )}

                  {/* Frame image */}
                  <div className="checkerboard aspect-5/4 rounded flex items-center justify-center overflow-hidden">
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

      {/* Click outside to close nth popover */}
      {showNthPopover && (
        <div className="fixed inset-0 z-10" onClick={() => setShowNthPopover(false)} />
      )}
    </div>
  );
}
