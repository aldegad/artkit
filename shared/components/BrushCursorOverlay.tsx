"use client";

import { cn } from "@/shared/utils/cn";
import { getBrushCursorVisuals } from "@/shared/utils/brushCursor";

interface BrushCursorOverlayProps {
  x: number;
  y: number;
  size: number;
  hardness: number;
  color: string;
  isEraser?: boolean;
  className?: string;
}

export default function BrushCursorOverlay({
  x,
  y,
  size,
  hardness,
  color,
  isEraser = false,
  className,
}: BrushCursorOverlayProps) {
  const safeSize = Math.max(1, size);
  const radius = safeSize / 2;
  const crosshairLength = Math.max(3, Math.min(radius * 0.45, 7));
  const visuals = getBrushCursorVisuals(hardness, color, isEraser);

  return (
    <div
      className={cn("pointer-events-none absolute", className)}
      style={{
        left: x,
        top: y,
        width: safeSize,
        height: safeSize,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: visuals.gradient,
          border: `1.5px solid ${visuals.ringColor}`,
          boxShadow: `0 0 0 1px ${visuals.outlineColor}`,
        }}
      />
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          width: crosshairLength * 2,
          height: 2,
          transform: "translate(-50%, -50%)",
          background: visuals.outlineColor,
        }}
      />
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          width: 2,
          height: crosshairLength * 2,
          transform: "translate(-50%, -50%)",
          background: visuals.outlineColor,
        }}
      />
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          width: crosshairLength * 2,
          height: 1,
          transform: "translate(-50%, -50%)",
          background: visuals.ringColor,
        }}
      />
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          width: 1,
          height: crosshairLength * 2,
          transform: "translate(-50%, -50%)",
          background: visuals.ringColor,
        }}
      />
    </div>
  );
}
