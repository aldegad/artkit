"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorFramesMeta, useEditorAnimation, useEditorTools, useEditorHistory, useEditorTracks, useEditorDrag } from "../contexts/SpriteEditorContext";
import { useLanguage } from "../../../shared/contexts";
import { Scrollbar, Tooltip, Popover } from "../../../shared/components";
import { DeleteIcon, EyeOpenIcon, EyeClosedIcon, ReorderIcon, OffsetIcon, FrameSkipToggleIcon, NthFrameSkipIcon, MenuIcon, PlusIcon } from "../../../shared/components/icons";
import { SpriteFrame } from "../types";
import { useSpriteTrackStore } from "../stores";
import { flipFrameImageData, FrameFlipDirection } from "../utils/frameUtils";

interface FrameCardProps {
  frame: SpriteFrame;
  idx: number;
  timelineMode: "reorder" | "offset";
  isPlaying: boolean;
  isCurrent: boolean;
  isSelected: boolean;
  isDragOver: boolean;
  isDragged: boolean;
  isEditingOffset: boolean;
  onDragStart: (e: React.DragEvent, frameId: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, dropIndex: number) => void;
  onDragEnd: () => void;
  onOffsetMouseDown: (e: React.MouseEvent, frameId: number) => void;
  onFrameClick: (e: React.MouseEvent, idx: number, frame: SpriteFrame) => void;
  onToggleDisabled: (frameId: number) => void;
}

const FrameCard = memo(function FrameCard({
  frame,
  idx,
  timelineMode,
  isPlaying,
  isCurrent,
  isSelected,
  isDragOver,
  isDragged,
  isEditingOffset,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onOffsetMouseDown,
  onFrameClick,
  onToggleDisabled,
}: FrameCardProps) {
  return (
    <div
      draggable={timelineMode === "reorder"}
      onDragStart={(e) => timelineMode === "reorder" && onDragStart(e, frame.id)}
      onDragOver={(e) => timelineMode === "reorder" && onDragOver(e, idx)}
      onDragLeave={timelineMode === "reorder" ? onDragLeave : undefined}
      onDrop={(e) => timelineMode === "reorder" && onDrop(e, idx)}
      onDragEnd={timelineMode === "reorder" ? onDragEnd : undefined}
      onMouseDown={(e) => timelineMode === "offset" && onOffsetMouseDown(e, frame.id)}
      onClick={(e) => onFrameClick(e, idx, frame)}
      className={`
        relative rounded-lg border-2 transition-all
        ${timelineMode === "reorder" ? "cursor-grab active:cursor-grabbing" : "cursor-move"}
        ${isPlaying && isCurrent ? "border-accent-warning shadow-sm shadow-accent-warning/30" : isSelected ? "border-accent-warning/60 bg-accent-warning/15" : isCurrent ? "border-accent-primary shadow-sm" : "border-border-default"}
        ${isDragOver ? "border-accent-primary! scale-105" : ""}
        ${isDragged ? "opacity-50" : ""}
        ${isEditingOffset ? "border-accent-warning!" : ""}
        ${frame.disabled ? "opacity-40" : ""}
      `}
    >
      {/* Frame number - on active or playing frame */}
      {isCurrent && (
        <div className={`absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold z-10 ${isPlaying ? "bg-accent-warning text-white" : "bg-text-primary text-surface-primary"}`}>
          {idx + 1}
        </div>
      )}

      {/* Skip toggle button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleDisabled(frame.id);
        }}
        className={`absolute top-0.5 right-0.5 z-10 w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
          frame.disabled
            ? "bg-accent-warning/90 text-white"
            : "bg-surface-tertiary/60 text-text-tertiary opacity-0 group-hover:opacity-100 hover:opacity-100!"
        }`}
        title={frame.disabled ? "건너뛰기 해제" : "건너뛰기"}
      >
        {frame.disabled ? (
          <EyeClosedIcon className="w-2.5 h-2.5" />
        ) : (
          <EyeOpenIcon className="w-2.5 h-2.5" />
        )}
      </button>

      {/* SKIP badge */}
      {frame.disabled && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-accent-warning/80 text-white text-[8px] font-bold px-1.5 py-0.5 rounded pointer-events-none">
          SKIP
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
  );
});

export default function FrameStrip() {
  const {
    frames, setFrames, nextFrameId, setNextFrameId,
    selectedFrameId, setSelectedFrameId,
    selectedFrameIds, setSelectedFrameIds,
    toggleSelectedFrameId, selectFrameRange,
  } = useEditorFramesMeta();
  const setCurrentFrameIndex = useSpriteTrackStore((s) => s.setCurrentFrameIndex);
  const { isPlaying, setIsPlaying } = useEditorAnimation();
  const { timelineMode, setTimelineMode } = useEditorTools();
  const { pushHistory } = useEditorHistory();
  const { addTrack, activeTrackId, insertEmptyFrameToTrack } = useEditorTracks();
  const {
    draggedFrameId, setDraggedFrameId, dragOverIndex, setDragOverIndex,
    editingOffsetFrameId, setEditingOffsetFrameId, offsetDragStart, setOffsetDragStart,
  } = useEditorDrag();

  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [isSkipToggleMode, setIsSkipToggleMode] = useState(false);
  const [showNthPopover, setShowNthPopover] = useState(false);
  const [nthValue, setNthValue] = useState(2);
  const [isFlippingFrames, setIsFlippingFrames] = useState(false);
  const [displayCurrentFrameIndex, setDisplayCurrentFrameIndex] = useState(() => useSpriteTrackStore.getState().currentFrameIndex);
  const { t } = useLanguage();

  // Compact mode
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [isToolbarCompact, setIsToolbarCompact] = useState(false);
  const [showCompactNth, setShowCompactNth] = useState(false);

  const getCurrentFrameIndex = useCallback(() => useSpriteTrackStore.getState().currentFrameIndex, []);

  const TOOLBAR_COMPACT_BREAKPOINT = 320;

  // Toolbar compact mode detection
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsToolbarCompact(entry.contentRect.width < TOOLBAR_COMPACT_BREAKPOINT);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Throttle visual frame indicator updates while playing to reduce timeline grid re-renders.
  useEffect(() => {
    const MAX_UI_FPS_WHILE_PLAYING = 12;
    const MIN_FRAME_MS = 1000 / MAX_UI_FPS_WHILE_PLAYING;
    let rafId: number | null = null;
    let pendingIndex: number | null = null;
    let lastPaintTs = 0;

    const flush = (ts: number) => {
      rafId = null;
      if (pendingIndex === null) return;
      if (!isPlaying || ts - lastPaintTs >= MIN_FRAME_MS) {
        lastPaintTs = ts;
        setDisplayCurrentFrameIndex(pendingIndex);
        pendingIndex = null;
        return;
      }
      rafId = requestAnimationFrame(flush);
    };

    const unsub = useSpriteTrackStore.subscribe((state, prev) => {
      if (state.currentFrameIndex === prev.currentFrameIndex) return;

      if (!isPlaying) {
        setDisplayCurrentFrameIndex(state.currentFrameIndex);
        return;
      }

      pendingIndex = state.currentFrameIndex;
      if (rafId === null) {
        rafId = requestAnimationFrame(flush);
      }
    });

    if (!isPlaying) {
      setDisplayCurrentFrameIndex(useSpriteTrackStore.getState().currentFrameIndex);
    }

    return () => {
      unsub();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isPlaying]);

  // Timeline drag handlers (reorder)
  const handleDragStart = useCallback(
    (e: React.DragEvent, frameId: number) => {
      setDraggedFrameId(frameId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(frameId));
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

      pushHistory();
      setFrames(newFrames);
      setDraggedFrameId(null);
      setDragOverIndex(null);
    },
    [draggedFrameId, frames, pushHistory, setFrames, setDraggedFrameId, setDragOverIndex],
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
    const currentFrameIndex = getCurrentFrameIndex();
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
  }, [frames, getCurrentFrameIndex, setFrames, selectedFrameId, setSelectedFrameId, pushHistory, setCurrentFrameIndex]);

  const addEmptyFrame = useCallback(() => {
    if (!activeTrackId) return;
    const currentFrameIndex = getCurrentFrameIndex();
    const insertIndex = frames.length === 0 ? 0 : currentFrameIndex + 1;

    pushHistory();
    const newFrameId = insertEmptyFrameToTrack(activeTrackId, insertIndex);
    if (newFrameId === null) return;

    setSelectedFrameId(newFrameId);
    setSelectedFrameIds([newFrameId]);
    setCurrentFrameIndex(insertIndex);
    setIsPlaying(false);
  }, [
    activeTrackId,
    frames.length,
    getCurrentFrameIndex,
    pushHistory,
    insertEmptyFrameToTrack,
    setSelectedFrameId,
    setSelectedFrameIds,
    setCurrentFrameIndex,
    setIsPlaying,
  ]);

  // Toggle disabled on a single frame
  const toggleFrameDisabled = useCallback(
    (frameId: number) => {
      const currentFrameIndex = getCurrentFrameIndex();
      pushHistory();
      const newFrames = frames.map((f: SpriteFrame) =>
        f.id === frameId ? { ...f, disabled: !f.disabled } : f,
      );
      setFrames(newFrames);

      // Auto-advance if current frame becomes disabled
      if (newFrames[currentFrameIndex]?.disabled) {
        const next = newFrames.findIndex((f: SpriteFrame, i: number) => i > currentFrameIndex && !f.disabled);
        if (next >= 0) {
          setCurrentFrameIndex(next);
        } else {
          const first = newFrames.findIndex((f: SpriteFrame) => !f.disabled);
          if (first >= 0) setCurrentFrameIndex(first);
        }
      }
    },
    [frames, getCurrentFrameIndex, pushHistory, setFrames, setCurrentFrameIndex],
  );

  // Toggle disabled on selected frames (batch)
  const toggleSelectedFramesDisabled = useCallback(() => {
    const currentFrameIndex = getCurrentFrameIndex();
    if (selectedFrameIds.length === 0) return;
    pushHistory();
    // If any selected frame is enabled, disable all; otherwise enable all
    const anyEnabled = frames.some(
      (f: SpriteFrame) => selectedFrameIds.includes(f.id) && !f.disabled,
    );
    const newFrames = frames.map((f: SpriteFrame) =>
      selectedFrameIds.includes(f.id) ? { ...f, disabled: anyEnabled } : f,
    );
    setFrames(newFrames);

    // Auto-advance if current frame becomes disabled
    if (newFrames[currentFrameIndex]?.disabled) {
      const next = newFrames.findIndex((f: SpriteFrame, i: number) => i > currentFrameIndex && !f.disabled);
      if (next >= 0) {
        setCurrentFrameIndex(next);
      } else {
        const first = newFrames.findIndex((f: SpriteFrame) => !f.disabled);
        if (first >= 0) setCurrentFrameIndex(first);
      }
    }
  }, [selectedFrameIds, frames, getCurrentFrameIndex, pushHistory, setFrames, setCurrentFrameIndex]);

  const flipSelectedFrames = useCallback(
    async (direction: FrameFlipDirection) => {
      if (isFlippingFrames || selectedFrameIds.length === 0) return;

      const selectedSet = new Set(selectedFrameIds);
      const framesToFlip = frames.filter(
        (frame: SpriteFrame) => selectedSet.has(frame.id) && Boolean(frame.imageData),
      );

      if (framesToFlip.length === 0) return;

      setIsFlippingFrames(true);
      try {
        const flippedResults = await Promise.all(
          framesToFlip.map(async (frame: SpriteFrame) => {
            try {
              const flippedImageData = await flipFrameImageData(frame.imageData!, direction);
              return { id: frame.id, imageData: flippedImageData };
            } catch (error) {
              console.error(`Failed to flip frame ${frame.id}`, error);
              return null;
            }
          }),
        );

        const flippedById = new Map<number, string>();
        for (const result of flippedResults) {
          if (result) {
            flippedById.set(result.id, result.imageData);
          }
        }

        if (flippedById.size === 0) return;

        pushHistory();
        setIsPlaying(false);
        setFrames((prev: SpriteFrame[]) =>
          prev.map((frame: SpriteFrame) => {
            const flippedImageData = flippedById.get(frame.id);
            return flippedImageData ? { ...frame, imageData: flippedImageData } : frame;
          }),
        );
      } finally {
        setIsFlippingFrames(false);
      }
    },
    [frames, isFlippingFrames, pushHistory, selectedFrameIds, setFrames, setIsPlaying],
  );

  // Nth skip: mark every non-nth frame as disabled (instead of deleting)
  const applyNthSkip = useCallback(() => {
    const currentFrameIndex = getCurrentFrameIndex();
    if (frames.length === 0 || nthValue < 1) return;
    pushHistory();
    const startIndex = currentFrameIndex;
    const newFrames = frames.map((f: SpriteFrame, idx: number) => {
      const relativeIdx = idx - startIndex;
      if (relativeIdx < 0) return f; // keep frames before start unchanged
      const isNth = relativeIdx % nthValue === 0;
      return { ...f, disabled: !isNth };
    });
    setFrames(newFrames);

    // Auto-advance if current frame becomes disabled
    if (newFrames[currentFrameIndex]?.disabled) {
      const next = newFrames.findIndex((f: SpriteFrame, i: number) => i >= currentFrameIndex && !f.disabled);
      if (next >= 0) setCurrentFrameIndex(next);
    }
    setShowNthPopover(false);
  }, [frames, getCurrentFrameIndex, nthValue, pushHistory, setFrames, setCurrentFrameIndex]);

  // Clear all disabled states
  const clearAllDisabled = useCallback(() => {
    const hasDisabled = frames.some((f: SpriteFrame) => f.disabled);
    if (!hasDisabled) return;
    pushHistory();
    setFrames((prev: SpriteFrame[]) =>
      prev.map((f: SpriteFrame) => (f.disabled ? { ...f, disabled: false } : f)),
    );
  }, [frames, pushHistory, setFrames]);

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

  const handleFrameClick = useCallback(
    (e: React.MouseEvent, idx: number, frame: SpriteFrame) => {
      setIsPlaying(false);

      // Skip toggle mode: clicking a frame toggles its disabled state
      if (isSkipToggleMode) {
        toggleFrameDisabled(frame.id);
        return;
      }

      const anchorFrameId = useSpriteTrackStore.getState().selectedFrameId;

      if (e.shiftKey && anchorFrameId !== null) {
        selectFrameRange(anchorFrameId, frame.id);
      } else if (e.ctrlKey || e.metaKey) {
        toggleSelectedFrameId(frame.id);
      } else {
        setSelectedFrameIds([frame.id]);
      }

      if (!frame.disabled) {
        setCurrentFrameIndex(idx);
      }
      setSelectedFrameId(frame.id);
    },
    [setIsPlaying, isSkipToggleMode, toggleFrameDisabled, selectFrameRange, toggleSelectedFrameId, setSelectedFrameIds, setCurrentFrameIndex, setSelectedFrameId],
  );

  // Count disabled frames
  const disabledCount = useMemo(
    () => frames.filter((f: SpriteFrame) => f.disabled).length,
    [frames],
  );

  // Determine which frames to display
  const displayFrames = useMemo(
    () =>
      showActiveOnly
        ? frames
            .map((frame: SpriteFrame, idx: number) => ({ frame, originalIndex: idx }))
            .filter(({ frame }: { frame: SpriteFrame }) => !frame.disabled)
        : frames.map((frame: SpriteFrame, idx: number) => ({ frame, originalIndex: idx })),
    [frames, showActiveOnly],
  );

  const selectedFrameIdSet = useMemo(() => new Set(selectedFrameIds), [selectedFrameIds]);

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
      <div ref={toolbarRef} className="border-b border-border-default shrink-0 bg-surface-secondary/50">
        {isToolbarCompact ? (
          /* Compact mode */
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            {/* Frame indicator - always visible */}
            <span className="text-xs text-text-secondary font-mono tabular-nums whitespace-nowrap">
              {frames.length > 0 ? `${displayCurrentFrameIndex + 1}/${frames.length}` : "0"}
            </span>

            <div className="flex-1" />

            {/* Compact menu */}
            <Popover
              trigger={
                <button className="p-1 rounded hover:bg-surface-tertiary text-text-secondary transition-colors" title="Frame tools">
                  <MenuIcon className="w-3.5 h-3.5" />
                </button>
              }
              align="end"
              side="bottom"
              closeOnScroll={false}
            >
              <div className="flex flex-col gap-0.5 p-1.5 min-w-[200px]">
                {/* Skip selected */}
                {selectedFrameIds.length > 1 && (
                  <button
                    onClick={toggleSelectedFramesDisabled}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-interactive-hover transition-colors"
                  >
                    <FrameSkipToggleIcon className="w-3.5 h-3.5" />
                    Skip selected ({selectedFrameIds.length})
                  </button>
                )}
                {selectedFrameIds.length > 0 && (
                  <>
                    <button
                      onClick={() => void flipSelectedFrames("horizontal")}
                      disabled={isFlippingFrames}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-interactive-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isFlippingFrames ? "Flipping..." : `Flip selected H (${selectedFrameIds.length})`}
                    </button>
                    <button
                      onClick={() => void flipSelectedFrames("vertical")}
                      disabled={isFlippingFrames}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-interactive-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Flip selected V ({selectedFrameIds.length})
                    </button>
                  </>
                )}
                {/* Reset all skips */}
                {disabledCount > 0 && (
                  <button
                    onClick={clearAllDisabled}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-accent-warning hover:bg-interactive-hover transition-colors"
                  >
                    Reset all skips ({disabledCount})
                  </button>
                )}
                {(selectedFrameIds.length > 0 || disabledCount > 0) && (
                  <div className="h-px bg-border-default mx-1" />
                )}
                {/* Show active only */}
                <button
                  onClick={() => setShowActiveOnly(!showActiveOnly)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-interactive-hover transition-colors"
                >
                  {showActiveOnly ? <EyeClosedIcon className="w-3.5 h-3.5" /> : <EyeOpenIcon className="w-3.5 h-3.5" />}
                  {showActiveOnly ? "Show all frames" : "Show active only"}
                  {showActiveOnly && <span className="ml-auto text-[10px] text-accent-primary">ON</span>}
                </button>
                {/* Skip toggle mode */}
                <button
                  onClick={() => setIsSkipToggleMode(!isSkipToggleMode)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-interactive-hover transition-colors"
                >
                  <FrameSkipToggleIcon className="w-3.5 h-3.5" />
                  Frame skip toggle
                  {isSkipToggleMode && <span className="ml-auto text-[10px] text-accent-warning">ON</span>}
                </button>
                {/* Nth skip */}
                <button
                  onClick={() => setShowCompactNth(!showCompactNth)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-interactive-hover transition-colors"
                >
                  <NthFrameSkipIcon className="w-3.5 h-3.5" />
                  Nth frame skip
                </button>
                {showCompactNth && (
                  <div className="px-2 py-1.5">
                    <div className="text-[10px] text-text-tertiary mb-1">현재 프레임부터 매 N번째 외 건너뛰기</div>
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
                        onClick={applyNthSkip}
                        className="flex-1 px-2 py-0.5 bg-accent-primary hover:bg-accent-primary-hover text-white rounded text-[10px] transition-colors"
                      >
                        적용
                      </button>
                    </div>
                  </div>
                )}
                <div className="h-px bg-border-default mx-1" />
                <button
                  onClick={addEmptyFrame}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-interactive-hover transition-colors"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  Add empty frame
                </button>
                {/* Delete */}
                <button
                  onClick={deleteActiveFrame}
                  disabled={frames.length === 0}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-accent-danger hover:bg-accent-danger/10 disabled:opacity-30 transition-colors"
                >
                  <DeleteIcon className="w-3.5 h-3.5" />
                  {t.deleteFrame}
                </button>
              </div>
            </Popover>

            {/* Separator */}
            <div className="w-px h-4 bg-border-default" />

            {/* Mode toggle - always visible */}
            <div className="flex gap-0.5 bg-surface-tertiary rounded p-0.5">
              <Tooltip content="프레임 순서 변경">
                <button
                  onClick={() => setTimelineMode("reorder")}
                  className={`p-1 rounded transition-colors ${
                    timelineMode === "reorder"
                      ? "bg-accent-primary text-white"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                  aria-label="Reorder mode"
                >
                  <ReorderIcon className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
              <Tooltip content="프레임 오프셋 이동">
                <button
                  onClick={() => setTimelineMode("offset")}
                  className={`p-1 rounded transition-colors ${
                    timelineMode === "offset"
                      ? "bg-accent-primary text-white"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                  aria-label="Offset mode"
                >
                  <OffsetIcon className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            </div>
          </div>
        ) : (
          /* Normal mode */
          <Scrollbar overflow={{ x: "scroll", y: "hidden" }}>
            <div className="flex items-center gap-1.5 px-2 py-1.5 whitespace-nowrap">
              {/* Frame indicator */}
              <span className="text-xs text-text-secondary font-mono tabular-nums">
                {frames.length > 0 ? `${displayCurrentFrameIndex + 1} / ${frames.length}` : "0"}
                {selectedFrameIds.length > 1 && (
                  <span className="text-accent-primary ml-1">({selectedFrameIds.length} sel)</span>
                )}
                {disabledCount > 0 && (
                  <span className="text-text-tertiary ml-1">({disabledCount} skip)</span>
                )}
              </span>

              <div className="flex-1" />

              {/* Toggle disabled on selected frames */}
              {selectedFrameIds.length > 1 && (
                <button
                  onClick={toggleSelectedFramesDisabled}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono text-text-tertiary hover:text-accent-warning transition-colors"
                  title="선택된 프레임 건너뛰기 토글"
                >
                  Skip
                </button>
              )}

              {selectedFrameIds.length > 0 && (
                <>
                  <button
                    onClick={() => void flipSelectedFrames("horizontal")}
                    disabled={isFlippingFrames}
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono text-text-tertiary hover:text-accent-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="선택된 프레임 이미지 좌우 반전"
                  >
                    {isFlippingFrames ? "Flipping" : "Flip H"}
                  </button>
                  <button
                    onClick={() => void flipSelectedFrames("vertical")}
                    disabled={isFlippingFrames}
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono text-text-tertiary hover:text-accent-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="선택된 프레임 이미지 상하 반전"
                  >
                    Flip V
                  </button>
                </>
              )}

              {/* Clear all disabled */}
              {disabledCount > 0 && (
                <button
                  onClick={clearAllDisabled}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono text-accent-warning hover:text-accent-warning/80 transition-colors"
                  title="모든 건너뛰기 해제"
                >
                  Reset
                </button>
              )}

              {/* Show active only toggle */}
              <Tooltip content={showActiveOnly ? "모든 프레임 보기" : "활성 프레임만 보기"}>
                <button
                  onClick={() => setShowActiveOnly(!showActiveOnly)}
                  className={`p-1 rounded transition-colors ${
                    showActiveOnly
                      ? "bg-accent-primary/15 text-accent-primary"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                  aria-label={showActiveOnly ? "Show all frames" : "Show only active frames"}
                >
                  {showActiveOnly ? (
                    <EyeClosedIcon className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOpenIcon className="w-3.5 h-3.5" />
                  )}
                </button>
              </Tooltip>

              <Tooltip content={isSkipToggleMode ? "프레임 스킵 토글 모드 해제" : "프레임 스킵 토글 모드 (클릭으로 프레임 스킵/표시 전환)"}>
                <button
                  onClick={() => setIsSkipToggleMode(!isSkipToggleMode)}
                  className={`p-1 rounded transition-colors ${
                    isSkipToggleMode
                      ? "bg-accent-warning/20 text-accent-warning"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                  aria-label="Toggle frame skip mode"
                >
                  <FrameSkipToggleIcon className="w-3.5 h-3.5" />
                </button>
              </Tooltip>

              {/* Nth skip */}
              <div className="relative">
                <Tooltip content="N번째 프레임만 유지하고 나머지 스킵">
                  <button
                    onClick={() => setShowNthPopover(!showNthPopover)}
                    className={`p-1 rounded transition-colors ${
                      showNthPopover
                        ? "bg-accent-primary/15 text-accent-primary"
                        : "text-text-tertiary hover:text-text-secondary"
                    }`}
                    aria-label="Nth frame skip settings"
                  >
                    <NthFrameSkipIcon className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
                {showNthPopover && (
                  <div className="absolute right-0 top-full mt-1 bg-surface-secondary border border-border-default rounded-lg shadow-lg p-2 z-20 min-w-[160px]">
                    <div className="text-[10px] text-text-secondary mb-1.5">
                      현재 프레임부터 매 N번째 외 건너뛰기
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
                        onClick={applyNthSkip}
                        className="flex-1 px-2 py-0.5 bg-accent-primary hover:bg-accent-primary-hover text-white rounded text-[10px] transition-colors"
                      >
                        적용
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Add empty frame */}
              <Tooltip content="빈 프레임 추가">
                <button
                  onClick={addEmptyFrame}
                  className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
                  aria-label="Add empty frame"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                </button>
              </Tooltip>

              {/* Delete active frame */}
              <Tooltip content={t.deleteFrame}>
                <button
                  onClick={deleteActiveFrame}
                  disabled={frames.length === 0}
                  className="p-1 rounded text-text-tertiary hover:text-accent-danger disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label={t.deleteFrame}
                >
                  <DeleteIcon className="w-3.5 h-3.5" />
                </button>
              </Tooltip>

              {/* Separator */}
              <div className="w-px h-4 bg-border-default" />

              {/* Mode toggle (icon-based) */}
              <div className="flex gap-0.5 bg-surface-tertiary rounded p-0.5">
                <Tooltip content="프레임 순서 변경">
                  <button
                    onClick={() => setTimelineMode("reorder")}
                    className={`p-1 rounded transition-colors ${
                      timelineMode === "reorder"
                        ? "bg-accent-primary text-white"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                    aria-label="Reorder mode"
                  >
                    <ReorderIcon className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
                <Tooltip content="프레임 오프셋 이동">
                  <button
                    onClick={() => setTimelineMode("offset")}
                    className={`p-1 rounded transition-colors ${
                      timelineMode === "offset"
                        ? "bg-accent-primary text-white"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                    aria-label="Offset mode"
                  >
                    <OffsetIcon className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </Scrollbar>
        )}
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
                ) : showActiveOnly && disabledCount > 0 ? (
                  <span>모든 프레임이 건너뛰기 상태입니다</span>
                ) : (
                  <span>Drag images here or import frames</span>
                )}
              </div>
            ) : (
              displayFrames.map(({ frame, originalIndex: idx }: { frame: SpriteFrame; originalIndex: number }) => (
                <FrameCard
                  key={frame.id}
                  frame={frame}
                  idx={idx}
                  timelineMode={timelineMode}
                  isPlaying={isPlaying}
                  isCurrent={idx === displayCurrentFrameIndex}
                  isSelected={selectedFrameIdSet.has(frame.id)}
                  isDragOver={dragOverIndex === idx}
                  isDragged={draggedFrameId === frame.id}
                  isEditingOffset={editingOffsetFrameId === frame.id}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                onOffsetMouseDown={handleOffsetMouseDown}
                onFrameClick={handleFrameClick}
                onToggleDisabled={toggleFrameDisabled}
              />
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
