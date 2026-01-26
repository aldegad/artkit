"use client";

import { useCallback, useEffect, useRef } from "react";
import { useEditorLayout } from "../../contexts/EditorLayoutContext";
import { SplitDirection } from "../../../../types/layout";

// ============================================
// Types
// ============================================

interface EditorResizeHandleProps {
  direction: SplitDirection;
  splitId: string;
  handleIndex: number;
}

// ============================================
// Component
// ============================================

export default function EditorResizeHandle({ direction, splitId, handleIndex }: EditorResizeHandleProps) {
  const { startResize, updateResize, endResize, resizeState } = useEditorLayout();
  const startPositionRef = useRef<number>(0);
  const isActiveHandle =
    resizeState?.splitId === splitId && resizeState?.handleIndex === handleIndex;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startPos = direction === "horizontal" ? e.clientX : e.clientY;
      startPositionRef.current = startPos;

      startResize({
        splitId,
        handleIndex,
        startPosition: startPos,
        direction,
      });
    },
    [direction, splitId, handleIndex, startResize],
  );

  // Global mouse move and up handlers
  useEffect(() => {
    if (!isActiveHandle) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = currentPos - startPositionRef.current;
      startPositionRef.current = currentPos;
      updateResize(delta);
    };

    const handleMouseUp = () => {
      endResize();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isActiveHandle, direction, updateResize, endResize]);

  const isHorizontal = direction === "horizontal";

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        shrink-0 relative group
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
