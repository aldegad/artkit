"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Ruler } from "./Ruler";
import { RulerCorner } from "./RulerCorner";
import { RULER_THICKNESS } from "../../utils/rulerUtils";
import type { GuideOrientation } from "../../types";

// ============================================
// Types
// ============================================

interface RulerContainerProps {
  children: React.ReactNode;
  showRulers: boolean;
  zoom: number;
  pan: { x: number; y: number };
  displaySize: { width: number; height: number };
  onGuideCreate?: (orientation: GuideOrientation, position: number) => void;
  onGuideDragStateChange?: (dragState: { orientation: GuideOrientation; position: number } | null) => void;
}

// ============================================
// RulerContainer Component
// Wraps canvas with rulers on top and left
// ============================================

export function RulerContainer({
  children,
  showRulers,
  zoom,
  pan,
  displaySize,
  onGuideCreate,
  onGuideDragStateChange,
}: RulerContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Handle guide creation from ruler
  const handleGuideCreate = useCallback(
    (orientation: GuideOrientation, position: number) => {
      onGuideCreate?.(orientation, position);
    },
    [onGuideCreate]
  );

  if (!showRulers) {
    return <>{children}</>;
  }

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      {/* Corner box */}
      <RulerCorner />

      {/* Horizontal ruler (top) */}
      <Ruler
        orientation="horizontal"
        zoom={zoom}
        pan={pan}
        displaySize={displaySize}
        containerSize={containerSize}
        onGuideCreate={handleGuideCreate}
        onDragStateChange={onGuideDragStateChange}
      />

      {/* Vertical ruler (left) */}
      <Ruler
        orientation="vertical"
        zoom={zoom}
        pan={pan}
        displaySize={displaySize}
        containerSize={containerSize}
        onGuideCreate={handleGuideCreate}
        onDragStateChange={onGuideDragStateChange}
      />

      {/* Canvas content (offset by ruler thickness) */}
      <div
        className="absolute overflow-hidden"
        style={{
          top: RULER_THICKNESS,
          left: RULER_THICKNESS,
          right: 0,
          bottom: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
