"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useEditorLayout } from "../../contexts/EditorLayoutContext";
import { useLanguage } from "../../../../shared/contexts";
import { PanelNode } from "../../../../types/layout";
import { getEditorPanelContent, getEditorPanelTitle, isEditorPanelHeaderVisible } from "./EditorPanelRegistry";

// ============================================
// Types
// ============================================

interface EditorPanelProps {
  node: PanelNode;
}

type DockPosition = "left" | "right" | "top" | "bottom" | null;

// ============================================
// Component
// ============================================

export default function EditorPanel({ node }: EditorPanelProps) {
  const { undockPanel, layoutState, updateDropTarget } = useEditorLayout();
  const { t } = useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);
  const [hoverPosition, setHoverPosition] = useState<DockPosition>(null);

  const content = getEditorPanelContent(node.panelId);
  const showHeader = isEditorPanelHeaderVisible(node.panelId);
  const title = getEditorPanelTitle(node.panelId);

  // Calculate which edge the mouse is closest to (10% threshold, max 60px)
  const calculateEdgePosition = useCallback((mouseX: number, mouseY: number): DockPosition => {
    const panel = panelRef.current;
    if (!panel) return null;

    const rect = panel.getBoundingClientRect();
    const distFromLeft = mouseX - rect.left;
    const distFromRight = rect.right - mouseX;
    const distFromTop = mouseY - rect.top;
    const distFromBottom = rect.bottom - mouseY;

    // Check if mouse is inside the panel
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
  }, []);

  // Listen for mouse movement when dragging (document level to work with floating windows)
  useEffect(() => {
    if (!layoutState.isDragging) {
      setHoverPosition(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const panel = panelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const isInsidePanel =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (isInsidePanel) {
        const position = calculateEdgePosition(e.clientX, e.clientY);
        setHoverPosition(position);

        // Update drop target based on position
        if (position) {
          updateDropTarget({ panelId: node.id, position });
        }
      } else {
        setHoverPosition(null);
      }
    };

    // Use document-level events to capture mouse even when floating window is on top
    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
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
              title={t.floatingMode}
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
