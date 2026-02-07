"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { getCanvasColorsSync } from "@/hooks";
import type { GuideOrientation } from "../../types";
import {
  calculateTickIntervals,
  getVisibleTicks,
  imageToScreenRuler,
  screenToImageRuler,
  RULER_THICKNESS,
  TICK_SIZE,
  RULER_FONT,
} from "../../utils/rulerUtils";

// ============================================
// Types
// ============================================

interface RulerProps {
  orientation: "horizontal" | "vertical";
  zoom: number;
  pan: { x: number; y: number };
  displaySize: { width: number; height: number };
  containerSize: { width: number; height: number };
  onGuideCreate?: (orientation: GuideOrientation, position: number) => void;
  onDragStateChange?: (dragState: { orientation: GuideOrientation; position: number } | null) => void;
}

// ============================================
// Ruler Component
// ============================================

export function Ruler({
  orientation,
  zoom,
  pan,
  displaySize,
  containerSize,
  onGuideCreate,
  onDragStateChange,
}: RulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<number | null>(null);

  // Calculate ruler offset (matches canvas offset calculation)
  // Must account for RULER_THICKNESS since canvas content area is smaller
  const getOffset = useCallback(() => {
    const scaledWidth = displaySize.width * zoom;
    const scaledHeight = displaySize.height * zoom;

    // Canvas content area excludes the ruler thickness
    const canvasAreaWidth = containerSize.width - RULER_THICKNESS;
    const canvasAreaHeight = containerSize.height - RULER_THICKNESS;

    if (orientation === "horizontal") {
      return (canvasAreaWidth - scaledWidth) / 2 + pan.x;
    } else {
      return (canvasAreaHeight - scaledHeight) / 2 + pan.y;
    }
  }, [orientation, displaySize, zoom, pan, containerSize]);

  // Render ruler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const colors = getCanvasColorsSync();
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size with DPR
    const width = orientation === "horizontal" ? containerSize.width - RULER_THICKNESS : RULER_THICKNESS;
    const height = orientation === "horizontal" ? RULER_THICKNESS : containerSize.height - RULER_THICKNESS;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);

    // Clear and fill background
    ctx.fillStyle = colors.rulerBg;
    ctx.fillRect(0, 0, width, height);

    // Calculate tick intervals
    const tickConfig = calculateTickIntervals(zoom);
    const offset = getOffset();

    // Calculate visible range in image coordinates
    const rulerSize = orientation === "horizontal" ? width : height;
    const viewStart = screenToImageRuler(0, offset, zoom);
    const viewEnd = screenToImageRuler(rulerSize, offset, zoom);

    // Get visible ticks
    const ticks = getVisibleTicks(viewStart, viewEnd, tickConfig);

    // Draw ticks
    ctx.strokeStyle = colors.rulerTick;
    ctx.fillStyle = colors.rulerText;
    ctx.font = `${RULER_FONT.size}px ${RULER_FONT.family}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (const tick of ticks) {
      const screenPos = imageToScreenRuler(tick.position, offset, zoom);

      // Skip ticks outside visible area
      if (screenPos < -10 || screenPos > rulerSize + 10) continue;

      const tickSize = tick.isMajor ? TICK_SIZE.major : TICK_SIZE.minor;

      ctx.beginPath();
      if (orientation === "horizontal") {
        ctx.moveTo(screenPos, height);
        ctx.lineTo(screenPos, height - tickSize);
        ctx.strokeStyle = tick.isMajor ? colors.rulerTickMajor : colors.rulerTick;
        ctx.stroke();

        // Draw label for major ticks
        if (tick.label) {
          ctx.fillStyle = colors.rulerText;
          ctx.fillText(tick.label, screenPos, 2);
        }
      } else {
        ctx.moveTo(width, screenPos);
        ctx.lineTo(width - tickSize, screenPos);
        ctx.strokeStyle = tick.isMajor ? colors.rulerTickMajor : colors.rulerTick;
        ctx.stroke();

        // Draw label for major ticks (rotated)
        if (tick.label) {
          ctx.save();
          ctx.translate(2, screenPos);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = colors.rulerText;
          ctx.fillText(tick.label, 0, 0);
          ctx.restore();
        }
      }
    }

    // Draw drag preview line
    if (isDragging && dragPosition !== null) {
      ctx.strokeStyle = colors.guideActive;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();

      const screenPos = imageToScreenRuler(dragPosition, offset, zoom);
      if (orientation === "horizontal") {
        ctx.moveTo(screenPos, 0);
        ctx.lineTo(screenPos, height);
      } else {
        ctx.moveTo(0, screenPos);
        ctx.lineTo(width, screenPos);
      }
      ctx.stroke();
    }

    // Draw bottom/right border
    ctx.strokeStyle = colors.rulerTick;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    if (orientation === "horizontal") {
      ctx.moveTo(0, height - 0.5);
      ctx.lineTo(width, height - 0.5);
    } else {
      ctx.moveTo(width - 0.5, 0);
      ctx.lineTo(width - 0.5, height);
    }
    ctx.stroke();
  }, [orientation, zoom, pan, containerSize, displaySize, getOffset, isDragging, dragPosition]);

  // Guide creation direction:
  // - Horizontal ruler (top): drag DOWN to create HORIZONTAL guide at Y position
  // - Vertical ruler (left): drag RIGHT to create VERTICAL guide at X position
  // So the guide orientation MATCHES the ruler orientation, but we measure the PERPENDICULAR coordinate
  const guideOrientation: GuideOrientation = orientation;

  // Get offset for the perpendicular axis (for measuring drag position)
  const getPerpendicularOffset = useCallback(() => {
    const scaledWidth = displaySize.width * zoom;
    const scaledHeight = displaySize.height * zoom;
    const canvasAreaWidth = containerSize.width - RULER_THICKNESS;
    const canvasAreaHeight = containerSize.height - RULER_THICKNESS;

    // For horizontal ruler, we need Y offset; for vertical ruler, we need X offset
    if (orientation === "horizontal") {
      return (canvasAreaHeight - scaledHeight) / 2 + pan.y;
    } else {
      return (canvasAreaWidth - scaledWidth) / 2 + pan.x;
    }
  }, [orientation, displaySize, zoom, pan, containerSize]);

  // Handle pointer events for creating guides
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onGuideCreate) return;

      // We need the container's bounding rect for perpendicular measurement
      // The ruler canvas rect is different from where we measure the guide position
      const containerRect = canvasRef.current?.parentElement?.getBoundingClientRect();
      if (!containerRect) return;

      const perpOffset = getPerpendicularOffset();
      let position: number;

      // Measure the perpendicular coordinate (Y for horizontal ruler, X for vertical ruler)
      if (orientation === "horizontal") {
        // Drag from top ruler → measure Y position (subtract ruler thickness for canvas area)
        const screenY = e.clientY - containerRect.top - RULER_THICKNESS;
        position = screenToImageRuler(screenY, perpOffset, zoom);
      } else {
        // Drag from left ruler → measure X position (subtract ruler thickness for canvas area)
        const screenX = e.clientX - containerRect.left - RULER_THICKNESS;
        position = screenToImageRuler(screenX, perpOffset, zoom);
      }

      setIsDragging(true);
      setDragPosition(position);
      onDragStateChange?.({ orientation: guideOrientation, position });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [onGuideCreate, orientation, guideOrientation, zoom, getPerpendicularOffset, onDragStateChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;

      const containerRect = canvasRef.current?.parentElement?.getBoundingClientRect();
      if (!containerRect) return;

      const perpOffset = getPerpendicularOffset();
      let position: number;

      if (orientation === "horizontal") {
        const screenY = e.clientY - containerRect.top - RULER_THICKNESS;
        position = screenToImageRuler(screenY, perpOffset, zoom);
      } else {
        const screenX = e.clientX - containerRect.left - RULER_THICKNESS;
        position = screenToImageRuler(screenX, perpOffset, zoom);
      }

      setDragPosition(position);
      onDragStateChange?.({ orientation: guideOrientation, position });
    },
    [isDragging, orientation, guideOrientation, zoom, getPerpendicularOffset, onDragStateChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || dragPosition === null || !onGuideCreate) {
        setIsDragging(false);
        setDragPosition(null);
        return;
      }

      // Check if position is within valid range
      // Horizontal guide needs Y within height, vertical guide needs X within width
      const maxPosition = orientation === "horizontal" ? displaySize.height : displaySize.width;
      if (dragPosition >= 0 && dragPosition <= maxPosition) {
        onGuideCreate(guideOrientation, dragPosition);
      }

      setIsDragging(false);
      setDragPosition(null);
      onDragStateChange?.(null);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [isDragging, dragPosition, onGuideCreate, orientation, guideOrientation, displaySize, onDragStateChange]
  );

  const handlePointerLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragPosition(null);
      onDragStateChange?.(null);
    }
  }, [isDragging, onDragStateChange]);

  const style = orientation === "horizontal"
    ? { left: RULER_THICKNESS, width: containerSize.width - RULER_THICKNESS }
    : { top: RULER_THICKNESS, height: containerSize.height - RULER_THICKNESS };

  return (
    <canvas
      ref={canvasRef}
      className={`absolute ${orientation === "horizontal" ? "top-0 cursor-ns-resize" : "left-0 cursor-ew-resize"}`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    />
  );
}
