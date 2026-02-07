// ============================================
// Guide Handler
// ============================================

import { useCallback, useRef, useState } from "react";
import { Guide } from "../../types";
import type { MouseEventContext, HandlerResult, GuideHandlerOptions } from "./types";

export interface UseGuideHandlerReturn {
  hoveredGuide: Guide | null;
  handleMouseDown: (ctx: MouseEventContext) => HandlerResult;
  handleMouseMove: (ctx: MouseEventContext) => void;
  handleMouseUp: () => void;
  updateHoveredGuide: (ctx: MouseEventContext) => void;
}

export function useGuideHandler(options: GuideHandlerOptions): UseGuideHandlerReturn {
  const { zoom, guides, showGuides, lockGuides, moveGuide, removeGuide, getGuideAtPosition, getDisplayDimensions } =
    options;

  const [hoveredGuide, setHoveredGuide] = useState<Guide | null>(null);
  const draggingGuideRef = useRef<{ guide: Guide; startPosition: number } | null>(null);

  const handleMouseDown = useCallback(
    (ctx: MouseEventContext): HandlerResult => {
      const { imagePos } = ctx;

      // Guide interaction - check if clicking on a guide (when not locked)
      if (showGuides && !lockGuides && getGuideAtPosition) {
        const tolerance = 5 / zoom; // 5 screen pixels tolerance
        const guide = getGuideAtPosition(imagePos, tolerance);
        if (guide) {
          // Start guide drag
          draggingGuideRef.current = {
            guide,
            startPosition: guide.position,
          };
          return {
            handled: true,
            dragType: "guide",
            dragStart: imagePos,
          };
        }
      }

      return { handled: false };
    },
    [showGuides, lockGuides, getGuideAtPosition, zoom]
  );

  const handleMouseMove = useCallback(
    (ctx: MouseEventContext) => {
      if (!draggingGuideRef.current || !moveGuide) return;

      const { imagePos } = ctx;
      const guide = draggingGuideRef.current.guide;

      const newPosition = guide.orientation === "horizontal" ? imagePos.y : imagePos.x;

      // Update guide position in real-time
      moveGuide(guide.id, newPosition);
    },
    [moveGuide]
  );

  const handleMouseUp = useCallback(() => {
    if (!draggingGuideRef.current || !removeGuide) {
      draggingGuideRef.current = null;
      return;
    }

    const guide = draggingGuideRef.current.guide;
    const { width, height } = getDisplayDimensions();
    const maxPosition = guide.orientation === "horizontal" ? height : width;

    // Get current position from guides array
    const currentGuide = guides?.find((g) => g.id === guide.id);
    const currentPosition = currentGuide?.position ?? guide.position;

    // Delete if dragged outside canvas bounds (with 10px tolerance)
    if (currentPosition < -10 || currentPosition > maxPosition + 10) {
      removeGuide(guide.id);
    }

    draggingGuideRef.current = null;
  }, [guides, removeGuide, getDisplayDimensions]);

  const updateHoveredGuide = useCallback(
    (ctx: MouseEventContext) => {
      const { imagePos } = ctx;

      // Check guide hover (when guides are visible and not locked)
      if (showGuides && !lockGuides && getGuideAtPosition) {
        const tolerance = 5 / zoom; // 5 screen pixels tolerance
        const guide = getGuideAtPosition(imagePos, tolerance);
        setHoveredGuide(guide);
      } else {
        setHoveredGuide(null);
      }
    },
    [showGuides, lockGuides, getGuideAtPosition, zoom]
  );

  return {
    hoveredGuide,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    updateHoveredGuide,
  };
}
