"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useLayout, useLayoutConfig } from "./LayoutConfigContext";
import { FloatingWindow } from "@/types/layout";

// ============================================
// Component
// ============================================

export default function FloatingWindows() {
  const {
    layoutState,
    closeFloatingWindow,
    updateFloatingWindowPosition,
    updateFloatingWindowSize,
    minimizeFloatingWindow,
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
          onMinimizeToggle={() => minimizeFloatingWindow(window.id)}
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
  onMinimizeToggle: () => void;
}

function FloatingWindowComponent({
  window,
  onClose,
  onPositionChange,
  onSizeChange,
  onMinimizeToggle,
}: FloatingWindowComponentProps) {
  const { startDragging, endDragging, layoutState, dockWindow } = useLayout();
  const config = useLayoutConfig();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
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
      startDragging(window.id);
    },
    [window.position, window.id, startDragging]
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
        const newX = clientX - dragOffsetRef.current.x;
        const newY = clientY - dragOffsetRef.current.y;
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
      if (isDragging && layoutState.dropTarget && layoutState.dropTarget.position !== "center") {
        // Dock the window
        dockWindow(window.id, layoutState.dropTarget.panelId, layoutState.dropTarget.position);
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
    window.id,
    onPositionChange,
    onSizeChange,
    endDragging,
    layoutState.dropTarget,
    dockWindow,
  ]);

  // ============================================
  // Minimized State Render
  // ============================================

  if (window.isMinimized) {
    return (
      <div
        className="fixed bg-surface-primary border border-border-default rounded-lg shadow-lg overflow-hidden z-50"
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
                onMinimizeToggle();
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

  return (
    <div
      className={`
        fixed bg-surface-primary border border-border-default rounded-lg shadow-2xl overflow-hidden flex flex-col z-50
        ${isDragging ? "opacity-80 cursor-grabbing" : ""}
        ${layoutState.dropTarget ? "ring-2 ring-accent-primary" : ""}
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
              onMinimizeToggle();
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
