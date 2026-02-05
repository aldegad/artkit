"use client";

import { useCallback, useEffect, useRef } from "react";
import { useLayout } from "./LayoutConfigContext";
import { SplitDirection } from "@/types/layout";

// ============================================
// Types
// ============================================

interface ResizeHandleProps {
  direction: SplitDirection;
  splitId: string;
  handleIndex: number;
}

// ============================================
// Component
// ============================================

export default function ResizeHandle({ direction, splitId, handleIndex }: ResizeHandleProps) {
  const { startResize, updateResizeAbsolute, endResize, resizeState } = useLayout();
  const handleRef = useRef<HTMLDivElement>(null);
  // Store the original start position at drag start (not updated during drag)
  const originalStartPositionRef = useRef<number>(0);
  // Store the actual split container size at drag start
  const containerSizeRef = useRef<number>(0);
  const isActiveHandle = resizeState?.splitId === splitId && resizeState?.handleIndex === handleIndex;

  // Get the actual split container size from this handle's parent element
  const getActualContainerSize = useCallback(() => {
    if (!handleRef.current) return 1000;
    // The parent element is the flex container of the split
    const parent = handleRef.current.parentElement;
    if (!parent) return 1000;
    return direction === "horizontal" ? parent.clientWidth : parent.clientHeight;
  }, [direction]);

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startPos = direction === "horizontal" ? e.clientX : e.clientY;
      originalStartPositionRef.current = startPos;
      containerSizeRef.current = getActualContainerSize();

      startResize({
        splitId,
        handleIndex,
        startPosition: startPos,
        direction,
        actualContainerSize: containerSizeRef.current,
      });
    },
    [direction, splitId, handleIndex, startResize, getActualContainerSize]
  );

  // Touch handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const touch = e.touches[0];
      const startPos = direction === "horizontal" ? touch.clientX : touch.clientY;
      originalStartPositionRef.current = startPos;
      containerSizeRef.current = getActualContainerSize();

      startResize({
        splitId,
        handleIndex,
        startPosition: startPos,
        direction,
        actualContainerSize: containerSizeRef.current,
      });
    },
    [direction, splitId, handleIndex, startResize, getActualContainerSize]
  );

  // Global mouse/touch move and up handlers
  useEffect(() => {
    if (!isActiveHandle) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === "horizontal" ? e.clientX : e.clientY;
      // Calculate total delta from original start position (not incremental)
      const totalDelta = currentPos - originalStartPositionRef.current;
      updateResizeAbsolute(totalDelta);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const currentPos = direction === "horizontal" ? touch.clientX : touch.clientY;
      // Calculate total delta from original start position (not incremental)
      const totalDelta = currentPos - originalStartPositionRef.current;
      updateResizeAbsolute(totalDelta);
    };

    const handleEnd = () => {
      endResize();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("touchcancel", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
    };
  }, [isActiveHandle, direction, updateResizeAbsolute, endResize]);

  const isHorizontal = direction === "horizontal";

  return (
    <div
      ref={handleRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      className={`
        shrink-0 relative group touch-none
        ${isHorizontal ? "w-1 cursor-ew-resize" : "h-1 cursor-ns-resize"}
        ${isActiveHandle ? "bg-accent-primary" : "bg-border-default hover:bg-accent-primary"}
        transition-colors duration-150
      `}
    >
      {/* Larger hit area for easier grabbing */}
      <div
        className={`
          absolute z-10
          ${isHorizontal ? "-left-1.5 -right-1.5 top-0 bottom-0" : "-top-1.5 -bottom-1.5 left-0 right-0"}
        `}
      />

      {/* Visual indicator on hover */}
      <div
        className={`
          absolute opacity-0 group-hover:opacity-100 transition-opacity
          ${
            isHorizontal
              ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-accent-primary-hover"
              : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1 rounded-full bg-accent-primary-hover"
          }
        `}
      />
    </div>
  );
}
