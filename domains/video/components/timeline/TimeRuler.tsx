"use client";

import { useRef, useEffect, useCallback } from "react";
import { useTimeline, useVideoState } from "../../contexts";
import { usePlaybackTick, useTimelineViewport, useVideoCoordinates } from "../../hooks";
import { cn } from "@/shared/utils/cn";
import { getCanvasColorsSync } from "@/shared/hooks";
import { TIMELINE } from "../../constants";

interface TimeRulerProps {
  className?: string;
  onSeek?: (time: number) => void;
}

export function TimeRuler({ className, onSeek }: TimeRulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewState } = useTimeline();
  const { seek, currentTimeRef, playback, project, setLoopRange } = useVideoState();
  const { timeToPixel, pixelToTime } = useVideoCoordinates();
  const { ensureTimeVisibleOnLeft } = useTimelineViewport();

  const duration = Math.max(project.duration, 0);
  const rangeStart = Math.max(0, Math.min(playback.loopStart, duration));
  const hasRange = playback.loopEnd > rangeStart + 0.001;
  const rangeEnd = hasRange
    ? Math.max(rangeStart + 0.001, Math.min(playback.loopEnd, duration))
    : duration;
  const hasCustomRange = hasRange && (rangeStart > 0.001 || rangeEnd < duration - 0.001);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const colors = getCanvasColorsSync();
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = TIMELINE.RULER_HEIGHT * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${TIMELINE.RULER_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = TIMELINE.RULER_HEIGHT;

    // Background
    ctx.fillStyle = colors.rulerBg;
    ctx.fillRect(0, 0, width, height);

    if (hasCustomRange) {
      const startX = Math.max(0, Math.min(width, timeToPixel(rangeStart)));
      const endX = Math.max(0, Math.min(width, timeToPixel(rangeEnd)));

      // Darken out-of-range area
      ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
      ctx.fillRect(0, 0, startX, height);
      ctx.fillRect(endX, 0, Math.max(0, width - endX), height);

      // Subtle highlight for active range
      ctx.fillStyle = "rgba(255, 140, 0, 0.16)";
      ctx.fillRect(startX, 0, Math.max(0, endX - startX), height);

      ctx.strokeStyle = colors.waveformPlayhead;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(startX + 0.5, 0);
      ctx.lineTo(startX + 0.5, height);
      ctx.moveTo(endX + 0.5, 0);
      ctx.lineTo(endX + 0.5, height);
      ctx.stroke();
    }

    // Calculate tick interval based on zoom
    const pixelsPerSecond = viewState.zoom;
    let tickInterval = 1; // seconds
    let majorTickInterval = 5;

    if (pixelsPerSecond < 20) {
      tickInterval = 10;
      majorTickInterval = 60;
    } else if (pixelsPerSecond < 50) {
      tickInterval = 5;
      majorTickInterval = 30;
    } else if (pixelsPerSecond < 100) {
      tickInterval = 1;
      majorTickInterval = 5;
    } else if (pixelsPerSecond < 200) {
      tickInterval = 0.5;
      majorTickInterval = 2.5;
    } else {
      tickInterval = 0.1;
      majorTickInterval = 1;
    }

    // Draw ticks
    const startTime = Math.max(0, Math.floor(viewState.scrollX / tickInterval) * tickInterval);
    const endTime = pixelToTime(width);

    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";

    for (let time = startTime; time <= endTime; time += tickInterval) {
      const safeTime = Math.max(0, time);
      const x = timeToPixel(safeTime);
      if (x < 0 || x > width) continue;

      const isMajor = safeTime % majorTickInterval < 0.001 || safeTime % majorTickInterval > majorTickInterval - 0.001;
      const tickHeight = isMajor ? 8 : 4;

      ctx.strokeStyle = isMajor ? colors.rulerTickMajor : colors.rulerTick;
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, height - tickHeight);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Draw time label for major ticks
      if (isMajor) {
        const mins = Math.floor(safeTime / 60);
        const secs = Math.floor(safeTime % 60);
        const label = mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
        ctx.fillStyle = colors.rulerText;
        ctx.fillText(label, x, height - 9);
      }
    }

    // Draw playhead marker — read from ref (no React state dependency)
    const playheadX = timeToPixel(currentTimeRef.current);
    if (playheadX >= 0 && playheadX <= width) {
      ctx.fillStyle = colors.waveformPlayhead;
      ctx.beginPath();
      ctx.moveTo(playheadX - 5, 0);
      ctx.lineTo(playheadX + 5, 0);
      ctx.lineTo(playheadX, 6);
      ctx.closePath();
      ctx.fill();
    }
  }, [viewState.zoom, viewState.scrollX, timeToPixel, pixelToTime, currentTimeRef, hasCustomRange, rangeStart, rangeEnd]);

  // Seek at a given clientX position
  const seekAtX = useCallback(
    (clientX: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = clientX - rect.left;
      const time = Math.max(0, pixelToTime(x));

      if (onSeek) {
        onSeek(time);
      } else {
        seek(time);
      }

      ensureTimeVisibleOnLeft(time);
    },
    [pixelToTime, seek, onSeek, ensureTimeVisibleOnLeft]
  );

  // Drag-seeking / range-handle dragging with pointer events
  const isDraggingRef = useRef(false);
  const dragHandleRef = useRef<"start" | "end" | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const startX = timeToPixel(rangeStart);
      const endX = timeToPixel(rangeEnd);

      const nearStart = hasRange && Math.abs(x - startX) <= 8;
      const nearEnd = hasRange && Math.abs(x - endX) <= 8;

      if (nearStart) {
        dragHandleRef.current = "start";
        return;
      }
      if (nearEnd) {
        dragHandleRef.current = "end";
        return;
      }

      // Shift-click: set IN, Alt-click: set OUT
      if (e.shiftKey || e.altKey) {
        const clickedTime = Math.max(0, pixelToTime(x));
        if (e.shiftKey) {
          setLoopRange(clickedTime, rangeEnd, true);
        } else {
          setLoopRange(rangeStart, clickedTime, true);
        }
        return;
      }

      seekAtX(e.clientX);
    },
    [seekAtX, timeToPixel, hasRange, rangeStart, rangeEnd, pixelToTime, setLoopRange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDraggingRef.current) return;
      if (dragHandleRef.current) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const draggedTime = Math.max(0, pixelToTime(x));
        if (dragHandleRef.current === "start") {
          setLoopRange(draggedTime, rangeEnd, true);
        } else {
          setLoopRange(rangeStart, draggedTime, true);
        }
        return;
      }
      seekAtX(e.clientX);
    },
    [seekAtX, pixelToTime, rangeStart, rangeEnd, setLoopRange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      isDraggingRef.current = false;
      dragHandleRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    []
  );

  // Render on structural changes (zoom, scroll)
  useEffect(() => {
    render();
  }, [render]);

  // Render on playback tick — driven by RAF, not React state
  usePlaybackTick(() => {
    render();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(render);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [render]);

  return (
    <div
      ref={containerRef}
      className={cn("h-4 w-full overflow-hidden", className)}
    >
      <canvas
        ref={canvasRef}
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="cursor-pointer"
        title="Click: seek | Shift+click: set IN | Alt+click: set OUT | Drag range lines to adjust"
      />
    </div>
  );
}
