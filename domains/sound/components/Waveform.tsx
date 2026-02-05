"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useSoundEditor } from "../contexts/SoundEditorContext";
import { cn } from "@/shared/utils/cn";
import { getCanvasColorsSync } from "@/hooks";

interface WaveformProps {
  className?: string;
}

export function Waveform({ className }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<"seek" | "trimStart" | "trimEnd" | null>(null);

  const {
    audioBuffer,
    duration,
    currentTime,
    isPlaying,
    trimRegion,
    zoom,
    scrollPosition,
    toolMode,
    seek,
    setTrimRegion,
  } = useSoundEditor();

  // Draw waveform
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !audioBuffer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get theme colors
    const colors = getCanvasColorsSync();

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.fillStyle = colors.waveformBg;
    ctx.fillRect(0, 0, width, height);

    // Get channel data (mix to mono for display)
    const channelData = audioBuffer.getChannelData(0);
    const secondChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;

    // Calculate visible range based on zoom and scroll
    const visibleDuration = duration / zoom;
    const startTime = scrollPosition;
    const endTime = Math.min(startTime + visibleDuration, duration);

    const startSample = Math.floor((startTime / duration) * channelData.length);
    const endSample = Math.floor((endTime / duration) * channelData.length);
    const samplesPerPixel = Math.max(1, Math.floor((endSample - startSample) / width));

    // Draw trim region background
    if (trimRegion) {
      const trimStartX = ((trimRegion.start - startTime) / visibleDuration) * width;
      const trimEndX = ((trimRegion.end - startTime) / visibleDuration) * width;

      // Dim areas outside trim region
      ctx.fillStyle = colors.overlay;
      ctx.fillRect(0, 0, Math.max(0, trimStartX), height);
      ctx.fillRect(Math.min(width, trimEndX), 0, width - Math.min(width, trimEndX), height);

      // Highlight trim region
      ctx.fillStyle = colors.waveformTrimFill;
      ctx.fillRect(
        Math.max(0, trimStartX),
        0,
        Math.min(width, trimEndX) - Math.max(0, trimStartX),
        height
      );
    }

    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = colors.waveformLine;
    ctx.lineWidth = 1;

    const midY = height / 2;

    for (let x = 0; x < width; x++) {
      const sampleIndex = startSample + x * samplesPerPixel;
      let min = 1;
      let max = -1;

      for (let j = 0; j < samplesPerPixel && sampleIndex + j < channelData.length; j++) {
        let sample = channelData[sampleIndex + j];
        if (secondChannel) {
          sample = (sample + secondChannel[sampleIndex + j]) / 2;
        }
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      const minY = midY + min * midY * 0.9;
      const maxY = midY + max * midY * 0.9;

      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
    }
    ctx.stroke();

    // Draw center line
    ctx.beginPath();
    ctx.strokeStyle = colors.grid;
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Draw trim handles
    if (trimRegion) {
      const trimStartX = ((trimRegion.start - startTime) / visibleDuration) * width;
      const trimEndX = ((trimRegion.end - startTime) / visibleDuration) * width;

      // Start handle
      if (trimStartX >= 0 && trimStartX <= width) {
        ctx.fillStyle = colors.waveformLine;
        ctx.fillRect(trimStartX - 2, 0, 4, height);
        // Handle grip
        ctx.fillStyle = colors.waveformHandle;
        ctx.fillRect(trimStartX - 6, height / 2 - 15, 8, 30);
      }

      // End handle
      if (trimEndX >= 0 && trimEndX <= width) {
        ctx.fillStyle = colors.waveformLine;
        ctx.fillRect(trimEndX - 2, 0, 4, height);
        // Handle grip
        ctx.fillStyle = colors.waveformHandle;
        ctx.fillRect(trimEndX - 2, height / 2 - 15, 8, 30);
      }
    }

    // Draw playhead
    const playheadX = ((currentTime - startTime) / visibleDuration) * width;
    if (playheadX >= 0 && playheadX <= width) {
      ctx.beginPath();
      ctx.strokeStyle = colors.waveformPlayhead;
      ctx.lineWidth = 2;
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Playhead triangle
      ctx.fillStyle = colors.waveformPlayhead;
      ctx.beginPath();
      ctx.moveTo(playheadX - 6, 0);
      ctx.lineTo(playheadX + 6, 0);
      ctx.lineTo(playheadX, 10);
      ctx.closePath();
      ctx.fill();
    }

    // Draw time markers
    ctx.fillStyle = colors.textOnColor;
    ctx.font = "10px sans-serif";
    const markerInterval = getMarkerInterval(visibleDuration);
    const firstMarker = Math.ceil(startTime / markerInterval) * markerInterval;

    for (let t = firstMarker; t < endTime; t += markerInterval) {
      const x = ((t - startTime) / visibleDuration) * width;
      ctx.fillText(formatTime(t), x + 2, height - 4);
      ctx.fillRect(x, height - 15, 1, 5);
    }
  }, [audioBuffer, duration, currentTime, trimRegion, zoom, scrollPosition]);

  // Animation loop for playhead
  useEffect(() => {
    if (!isPlaying) {
      drawWaveform();
      return;
    }

    let animationId: number;
    const animate = () => {
      drawWaveform();
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isPlaying, drawWaveform]);

  // Redraw on state changes
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform, zoom, scrollPosition, trimRegion]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => drawWaveform();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawWaveform]);

  // Mouse handlers
  const getTimeFromX = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return 0;

      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const visibleDuration = duration / zoom;
      const time = scrollPosition + (x / rect.width) * visibleDuration;
      return Math.max(0, Math.min(duration, time));
    },
    [duration, zoom, scrollPosition]
  );

  const isNearTrimHandle = useCallback(
    (clientX: number): "trimStart" | "trimEnd" | null => {
      if (!trimRegion || !canvasRef.current) return null;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const visibleDuration = duration / zoom;

      const startX = ((trimRegion.start - scrollPosition) / visibleDuration) * rect.width;
      const endX = ((trimRegion.end - scrollPosition) / visibleDuration) * rect.width;

      if (Math.abs(x - startX) < 10) return "trimStart";
      if (Math.abs(x - endX) < 10) return "trimEnd";
      return null;
    },
    [trimRegion, duration, zoom, scrollPosition]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!audioBuffer) return;

      const handleType = isNearTrimHandle(e.clientX);

      if (handleType) {
        setIsDragging(true);
        setDragType(handleType);
      } else if (toolMode === "trim") {
        const time = getTimeFromX(e.clientX);
        setTrimRegion({ start: time, end: time });
        setIsDragging(true);
        setDragType("trimEnd");
      } else {
        const time = getTimeFromX(e.clientX);
        seek(time);
        setIsDragging(true);
        setDragType("seek");
      }
    },
    [audioBuffer, toolMode, getTimeFromX, isNearTrimHandle, seek, setTrimRegion]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !dragType) return;

      const time = getTimeFromX(e.clientX);

      if (dragType === "seek") {
        seek(time);
      } else if (dragType === "trimStart" && trimRegion) {
        setTrimRegion({
          start: Math.min(time, trimRegion.end - 0.01),
          end: trimRegion.end,
        });
      } else if (dragType === "trimEnd" && trimRegion) {
        setTrimRegion({
          start: trimRegion.start,
          end: Math.max(time, trimRegion.start + 0.01),
        });
      }
    },
    [isDragging, dragType, getTimeFromX, seek, trimRegion, setTrimRegion]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragType(null);
  }, []);

  // Update cursor based on position
  const handleCursorUpdate = useCallback(
    (e: React.MouseEvent) => {
      if (!canvasRef.current) return;

      const handleType = isNearTrimHandle(e.clientX);
      if (handleType) {
        canvasRef.current.style.cursor = "ew-resize";
      } else if (toolMode === "trim") {
        canvasRef.current.style.cursor = "crosshair";
      } else {
        canvasRef.current.style.cursor = "pointer";
      }
    },
    [isNearTrimHandle, toolMode]
  );

  if (!audioBuffer) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-surface-tertiary text-text-tertiary",
          className
        )}
      >
        No audio loaded
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => {
          handleMouseMove(e);
          handleCursorUpdate(e);
        }}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}

// Helper functions
function getMarkerInterval(duration: number): number {
  if (duration < 1) return 0.1;
  if (duration < 5) return 0.5;
  if (duration < 30) return 1;
  if (duration < 60) return 5;
  if (duration < 300) return 10;
  if (duration < 600) return 30;
  return 60;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
  }
  return `${secs.toFixed(1)}s`;
}
