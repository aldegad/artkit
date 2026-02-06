"use client";

import { useRef, useEffect, useCallback } from "react";
import { useTimeline, useVideoState } from "../../contexts";
import { useVideoCoordinates, usePlaybackTick } from "../../hooks";
import { cn } from "@/shared/utils/cn";
import { getCanvasColorsSync } from "@/hooks";
import { TIMELINE } from "../../constants";

interface TimeRulerProps {
  className?: string;
  onSeek?: (time: number) => void;
}

export function TimeRuler({ className, onSeek }: TimeRulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewState, setScrollX } = useTimeline();
  const { seek, currentTimeRef } = useVideoState();
  const { timeToPixel, pixelToTime } = useVideoCoordinates();

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
    const startTime = Math.floor(viewState.scrollX / tickInterval) * tickInterval;
    const endTime = viewState.scrollX + width / pixelsPerSecond;

    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";

    for (let time = startTime; time <= endTime; time += tickInterval) {
      const x = timeToPixel(time);
      if (x < 0 || x > width) continue;

      const isMajor = time % majorTickInterval < 0.001 || time % majorTickInterval > majorTickInterval - 0.001;
      const tickHeight = isMajor ? 8 : 4;

      ctx.strokeStyle = isMajor ? colors.rulerTickMajor : colors.rulerTick;
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, height - tickHeight);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Draw time label for major ticks
      if (isMajor) {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
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
  }, [viewState.zoom, viewState.scrollX, timeToPixel, currentTimeRef]);

  // Handle click to seek
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const time = Math.max(0, pixelToTime(x));

      if (onSeek) {
        onSeek(time);
      } else {
        seek(time);
      }

      // Auto-scroll to keep playhead visible
      if (time < viewState.scrollX) {
        setScrollX(time);
      }
    },
    [pixelToTime, seek, onSeek, viewState.scrollX, setScrollX]
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
        onClick={handleClick}
        className="cursor-pointer"
      />
    </div>
  );
}
