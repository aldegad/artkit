"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useLayout, useLayoutConfig } from "./LayoutConfigContext";
import { FloatingWindow, SnapEdge } from "@/types/layout";

// ============================================
// Component
// ============================================

export default function FloatingWindows() {
  const {
    layoutState,
    closeFloatingWindow,
    updateFloatingWindowPosition,
    updateFloatingWindowSize,
  } = useLayout();

  return (
    <>
      {layoutState.floatingWindows.map((window) => (
        <FloatingWindowComponent
          key={window.id}
          window={window}
          onClose={() => closeFloatingWindow(window.id)}
          onPositionChange={(pos) => updateFloatingWindowPosition(window.id, pos)}
          onSizeChange={(size) => updateFloatingWindowSize(window.id, size)}
        />
      ))}
    </>
  );
}

// ============================================
// Floating Window Component
// ============================================

interface FloatingWindowComponentProps {
  window: FloatingWindow;
  onClose: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  onSizeChange: (size: { width: number; height: number }) => void;
}

// Edge snap threshold in pixels
const EDGE_SNAP_THRESHOLD = 30;

function FloatingWindowComponent({
  window,
  onClose,
  onPositionChange,
  onSizeChange,
}: FloatingWindowComponentProps) {
  const {
    startDragging,
    endDragging,
    layoutState,
    dockWindow,
    getAllPanelRects,
    getPanelRect,
    minimizeFloatingWindow,
    updateFloatingWindowSnap,
    updateFloatingWindowMinimizedPosition,
  } = useLayout();
  const config = useLayoutConfig();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [snappedEdge, setSnappedEdge] = useState<SnapEdge | null>(null);
  const [snappedPanelId, setSnappedPanelId] = useState<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const title = config.getPanelTitle(window.panelId);
  const content = config.getPanelContent(window.panelId);
  const defaultSize = config.getPanelDefaultSize(window.panelId);

  // ============================================
  // Drag Handlers (Mouse + Touch)
  // ============================================

  const handleDragStart = useCallback(
    (clientX: number, clientY: number) => {
      setIsDragging(true);
      dragOffsetRef.current = {
        x: clientX - window.position.x,
        y: clientY - window.position.y,
      };

      // Enable dock mode for normal windows (not minimized)
      // Panel.tsx now properly clears dropTarget when not near edges,
      // so docking only happens when actually hovering a dock zone
      if (!window.isMinimized) {
        startDragging(window.id);
      }

      // Clear snap when starting to drag
      setSnappedEdge(null);
    },
    [window.position, window.id, window.isMinimized, startDragging]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      handleDragStart(e.clientX, e.clientY);
    },
    [handleDragStart]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      handleDragStart(touch.clientX, touch.clientY);
    },
    [handleDragStart]
  );

  // ============================================
  // Resize Handlers (Mouse + Touch)
  // ============================================

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  const handleResizeTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  // ============================================
  // Global Move/End Handlers
  // ============================================

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handlePointerMove = (clientX: number, clientY: number) => {
      if (isDragging) {
        let newX = clientX - dragOffsetRef.current.x;
        let newY = clientY - dragOffsetRef.current.y;

        // For minimized windows, check for edge snapping against split panels
        if (window.isMinimized) {
          const panelRects = getAllPanelRects();
          const windowWidth = window.size.width || defaultSize.width;
          const titleBarHeight = 40;

          let foundSnap = false;

          // Find the panel that contains the cursor and check edge snapping
          for (const [panelId, rect] of panelRects) {
            // Check if cursor is within this panel's bounds
            const isInPanel =
              clientX >= rect.left &&
              clientX <= rect.right &&
              clientY >= rect.top &&
              clientY <= rect.bottom;

            if (isInPanel) {
              const nearLeft = newX < rect.left + EDGE_SNAP_THRESHOLD;
              const nearRight = newX + windowWidth > rect.right - EDGE_SNAP_THRESHOLD;
              const nearTop = newY < rect.top + EDGE_SNAP_THRESHOLD;
              const nearBottom = newY + titleBarHeight > rect.bottom - EDGE_SNAP_THRESHOLD;

              // Check corners first (when near two edges simultaneously)
              if (nearTop && nearLeft) {
                newX = rect.left;
                newY = rect.top;
                setSnappedEdge("top-left");
                setSnappedPanelId(panelId);
                foundSnap = true;
              } else if (nearTop && nearRight) {
                newX = rect.right - windowWidth;
                newY = rect.top;
                setSnappedEdge("top-right");
                setSnappedPanelId(panelId);
                foundSnap = true;
              } else if (nearBottom && nearLeft) {
                newX = rect.left;
                newY = rect.bottom - titleBarHeight;
                setSnappedEdge("bottom-left");
                setSnappedPanelId(panelId);
                foundSnap = true;
              } else if (nearBottom && nearRight) {
                newX = rect.right - windowWidth;
                newY = rect.bottom - titleBarHeight;
                setSnappedEdge("bottom-right");
                setSnappedPanelId(panelId);
                foundSnap = true;
              }
              // Then check single edges
              else if (nearLeft) {
                newX = rect.left;
                setSnappedEdge("left");
                setSnappedPanelId(panelId);
                foundSnap = true;
              } else if (nearRight) {
                newX = rect.right - windowWidth;
                setSnappedEdge("right");
                setSnappedPanelId(panelId);
                foundSnap = true;
              } else if (nearTop) {
                newY = rect.top;
                setSnappedEdge("top");
                setSnappedPanelId(panelId);
                foundSnap = true;
              } else if (nearBottom) {
                newY = rect.bottom - titleBarHeight;
                setSnappedEdge("bottom");
                setSnappedPanelId(panelId);
                foundSnap = true;
              }

              break; // Found the panel, stop searching
            }
          }

          if (!foundSnap) {
            setSnappedEdge(null);
            setSnappedPanelId(null);
          }
        }

        onPositionChange({ x: Math.max(0, newX), y: Math.max(0, newY) });
      }

      if (isResizing) {
        const newWidth = Math.max(200, clientX - window.position.x);
        const newHeight = Math.max(150, clientY - window.position.y);
        onSizeChange({ width: newWidth, height: newHeight });
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

    const handleEnd = () => {
      // Dock if there's a valid drop target (Panel clears dropTarget when not near edges)
      if (isDragging && layoutState.dropTarget && layoutState.dropTarget.position !== "center") {
        dockWindow(window.id, layoutState.dropTarget.panelId, layoutState.dropTarget.position);
      }

      // Save snap info for minimized windows
      if (isDragging && window.isMinimized && snappedEdge && snappedPanelId) {
        updateFloatingWindowSnap(window.id, { panelId: snappedPanelId, edge: snappedEdge });
      } else if (isDragging && window.isMinimized && !snappedEdge) {
        // Clear snap info if no longer snapped
        updateFloatingWindowSnap(window.id, undefined);
      }

      setIsDragging(false);
      setIsResizing(false);
      endDragging();
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
  }, [
    isDragging,
    isResizing,
    window.position,
    window.size,
    window.isMinimized,
    window.id,
    defaultSize.width,
    onPositionChange,
    onSizeChange,
    endDragging,
    layoutState.dropTarget,
    dockWindow,
    getAllPanelRects,
    snappedEdge,
    snappedPanelId,
    updateFloatingWindowSnap,
  ]);

  // ============================================
  // Minimize/Expand Handlers
  // ============================================

  const handleExpand = useCallback(() => {
    // Save current position before expanding
    updateFloatingWindowMinimizedPosition(window.id, window.position);

    // If snapped to a panel, expand with previous size aligned to snap position
    if (window.snappedTo) {
      const rect = getPanelRect(window.snappedTo.panelId);
      if (rect) {
        const width = window.size.width || defaultSize.width;
        const height = window.size.height || defaultSize.height;
        const edge = window.snappedTo.edge;

        let newX = window.position.x;
        let newY = window.position.y;

        // Calculate position based on snap edge/corner
        switch (edge) {
          case "top-left":
            newX = rect.left;
            newY = rect.top;
            break;
          case "top-right":
            newX = rect.right - width;
            newY = rect.top;
            break;
          case "bottom-left":
            newX = rect.left;
            newY = rect.bottom - height;
            break;
          case "bottom-right":
            newX = rect.right - width;
            newY = rect.bottom - height;
            break;
          case "left":
            newX = rect.left;
            // Keep Y, but ensure it's within panel bounds
            newY = Math.max(rect.top, Math.min(rect.bottom - height, newY));
            break;
          case "right":
            newX = rect.right - width;
            newY = Math.max(rect.top, Math.min(rect.bottom - height, newY));
            break;
          case "top":
            newY = rect.top;
            // Keep X, but ensure it's within panel bounds
            newX = Math.max(rect.left, Math.min(rect.right - width, newX));
            break;
          case "bottom":
            newY = rect.bottom - height;
            newX = Math.max(rect.left, Math.min(rect.right - width, newX));
            break;
        }

        onPositionChange({ x: newX, y: newY });
        // Size stays the same (previous size)
      }
    }

    minimizeFloatingWindow(window.id);
  }, [
    window.id,
    window.position,
    window.size,
    window.snappedTo,
    defaultSize,
    updateFloatingWindowMinimizedPosition,
    getPanelRect,
    onPositionChange,
    minimizeFloatingWindow,
  ]);

  const handleMinimize = useCallback(() => {
    // Restore to minimized position if available
    if (window.minimizedPosition) {
      onPositionChange(window.minimizedPosition);
    }

    minimizeFloatingWindow(window.id);
  }, [window.id, window.minimizedPosition, onPositionChange, minimizeFloatingWindow]);

  // ============================================
  // Minimized State Render
  // ============================================

  if (window.isMinimized) {
    return (
      <div
        className={`
          fixed bg-surface-primary border border-border-default rounded-lg shadow-lg overflow-hidden z-50
          ${snappedEdge ? "ring-2 ring-accent-primary/50" : ""}
          ${isDragging ? "opacity-80" : ""}
        `}
        style={{
          left: window.position.x,
          top: window.position.y,
          width: window.size.width || defaultSize.width,
        }}
      >
        {/* Collapsed title bar */}
        <div
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className="flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-border-default cursor-grab active:cursor-grabbing select-none touch-none"
        >
          <span className="text-sm font-medium text-text-primary truncate">{title}</span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {/* Restore button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleExpand();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="p-1 hover:bg-interactive-hover rounded text-text-secondary hover:text-text-primary transition-colors"
              title="Restore"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8h16M4 16h16"
                />
              </svg>
            </button>
            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="p-1 hover:bg-accent-danger rounded text-text-secondary hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // Normal State Render
  // ============================================

  // Show dock indicator when dragging and hovering a dock zone
  const showDockIndicator = isDragging && layoutState.dropTarget;

  return (
    <div
      className={`
        fixed bg-surface-primary border border-border-default rounded-lg shadow-2xl overflow-hidden flex flex-col z-50
        ${isDragging ? "opacity-80 cursor-grabbing" : ""}
        ${showDockIndicator ? "ring-2 ring-accent-primary" : ""}
      `}
      style={{
        left: window.position.x,
        top: window.position.y,
        width: window.size.width || defaultSize.width,
        height: window.size.height || defaultSize.height,
      }}
    >
      {/* Title bar */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-border-default cursor-grab active:cursor-grabbing select-none touch-none flex-shrink-0"
      >
        <span className="text-sm font-medium text-text-primary truncate">{title}</span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {/* Minimize button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMinimize();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="p-1 hover:bg-interactive-hover rounded text-text-secondary hover:text-text-primary transition-colors"
            title="Minimize"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="p-1 hover:bg-accent-danger rounded text-text-secondary hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{content}</div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        onTouchStart={handleResizeTouchStart}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize touch-none"
        style={{
          background: "linear-gradient(135deg, transparent 50%, rgba(100,100,100,0.5) 50%)",
        }}
      />
    </div>
  );
}
