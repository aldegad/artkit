"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useLayout, useLayoutConfig } from "./LayoutConfigContext";
import { PanelNode } from "@/types/layout";

// ============================================
// Types
// ============================================

interface PanelProps {
  node: PanelNode;
}

type DockPosition = "left" | "right" | "top" | "bottom" | null;

// ============================================
// Component
// ============================================

export default function Panel({ node }: PanelProps) {
  const { undockPanel, layoutState, updateDropTarget, registerPanelRef, unregisterPanelRef } = useLayout();
  const config = useLayoutConfig();
  const panelRef = useRef<HTMLDivElement>(null);
  const [hoverPosition, setHoverPosition] = useState<DockPosition>(null);

  const content = config.getPanelContent(node.panelId);
  const showHeader = config.isPanelHeaderVisible(node.panelId);
  const title = config.getPanelTitle(node.panelId);

  // Register panel ref for snap functionality
  useEffect(() => {
    registerPanelRef(node.id, panelRef);
    return () => {
      unregisterPanelRef(node.id);
    };
  }, [node.id, registerPanelRef, unregisterPanelRef]);

  // Calculate which edge the mouse/touch is closest to (10% threshold, max 60px)
  const calculateEdgePosition = useCallback(
    (clientX: number, clientY: number): DockPosition => {
      const panel = panelRef.current;
      if (!panel) return null;

      const rect = panel.getBoundingClientRect();
      const distFromLeft = clientX - rect.left;
      const distFromRight = rect.right - clientX;
      const distFromTop = clientY - rect.top;
      const distFromBottom = rect.bottom - clientY;

      // Check if pointer is inside the panel
      if (distFromLeft < 0 || distFromRight < 0 || distFromTop < 0 || distFromBottom < 0) {
        return null;
      }

      // Use smaller of 10% or 60px as threshold
      const thresholdX = Math.min(rect.width * 0.1, 60);
      const thresholdY = Math.min(rect.height * 0.1, 60);

      // Determine which edge is closest (only if within threshold)
      if (distFromLeft < thresholdX) return "left";
      if (distFromRight < thresholdX) return "right";
      if (distFromTop < thresholdY) return "top";
      if (distFromBottom < thresholdY) return "bottom";

      return null;
    },
    []
  );

  // Listen for pointer movement when dragging
  useEffect(() => {
    if (!layoutState.isDragging) {
      setHoverPosition(null);
      return;
    }

    const handlePointerMove = (clientX: number, clientY: number) => {
      const panel = panelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const isInsidePanel =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;

      if (isInsidePanel) {
        const position = calculateEdgePosition(clientX, clientY);
        setHoverPosition(position);

        // Update drop target based on position
        if (position) {
          updateDropTarget({ panelId: node.id, position });
        } else {
          // Clear drop target when inside panel but not near edge
          updateDropTarget(null);
        }
      } else {
        setHoverPosition(null);
        // Don't clear dropTarget here - let the panel the pointer is actually in handle it
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      handlePointerMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        handlePointerMove(touch.clientX, touch.clientY);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("touchmove", handleTouchMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [layoutState.isDragging, calculateEdgePosition, node.id, updateDropTarget]);

  // Dock zone indicator styles (smaller, only show when hovering that zone)
  const getDockZoneStyle = (position: DockPosition): React.CSSProperties => {
    const isActive = hoverPosition === position;

    // Only show the zone that's being hovered
    if (!isActive) {
      return { display: "none" };
    }

    const base: React.CSSProperties = {
      position: "absolute",
      backgroundColor: "var(--accent-primary-surface, rgba(59, 130, 246, 0.2))",
      border: "2px dashed var(--accent-primary)",
      transition: "all 0.1s ease",
      zIndex: 10,
      pointerEvents: "none",
      borderRadius: "8px",
    };

    // Smaller indicator size (max 60px or 10%)
    const size = "min(10%, 60px)";

    switch (position) {
      case "left":
        return {
          ...base,
          left: "4px",
          top: "4px",
          width: size,
          height: "calc(100% - 8px)",
        };
      case "right":
        return {
          ...base,
          right: "4px",
          top: "4px",
          width: size,
          height: "calc(100% - 8px)",
        };
      case "top":
        return {
          ...base,
          left: "4px",
          top: "4px",
          width: "calc(100% - 8px)",
          height: size,
        };
      case "bottom":
        return {
          ...base,
          left: "4px",
          bottom: "4px",
          width: "calc(100% - 8px)",
          height: size,
        };
      default:
        return { display: "none" };
    }
  };

  return (
    <div
      ref={panelRef}
      className="h-full w-full flex flex-col overflow-hidden relative bg-surface-primary shadow-sm border border-border-subtle"
    >
      {showHeader && (
        <div className="panel-header shrink-0">
          <span className="text-sm font-semibold text-text-primary">{title}</span>
          <div className="flex items-center gap-1">
            {/* Undock button */}
            <button
              onClick={() => undockPanel(node.id)}
              className="p-1.5 hover:bg-interactive-hover rounded-lg text-text-tertiary hover:text-text-primary transition-all"
              title="Floating mode"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden bg-surface-primary">{content}</div>

      {/* Dock zone indicators - only show when dragging */}
      {layoutState.isDragging && (
        <>
          <div style={getDockZoneStyle("left")} />
          <div style={getDockZoneStyle("right")} />
          <div style={getDockZoneStyle("top")} />
          <div style={getDockZoneStyle("bottom")} />
        </>
      )}
    </div>
  );
}
