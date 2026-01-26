"use client";

import { useState, useCallback, useEffect } from "react";
import { useEditorLayout } from "../../contexts/EditorLayoutContext";
import { FloatingWindow } from "../../../../types/layout";
import { getEditorPanelContent, getEditorPanelTitle, getEditorPanelDefaultSize } from "./EditorPanelRegistry";

// ============================================
// Component
// ============================================

export default function EditorFloatingWindows() {
  const {
    layoutState,
    closeFloatingWindow,
    updateFloatingWindowPosition,
    updateFloatingWindowSize,
  } = useEditorLayout();

  return (
    <>
      {layoutState.floatingWindows.map((window) => (
        <EditorFloatingWindowComponent
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

interface EditorFloatingWindowComponentProps {
  window: FloatingWindow;
  onClose: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  onSizeChange: (size: { width: number; height: number }) => void;
}

function EditorFloatingWindowComponent({
  window,
  onClose,
  onPositionChange,
  onSizeChange,
}: EditorFloatingWindowComponentProps) {
  const { startDragging, endDragging, layoutState, dockWindow } = useEditorLayout();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const title = getEditorPanelTitle(window.panelId);
  const content = getEditorPanelContent(window.panelId);
  const defaultSize = getEditorPanelDefaultSize(window.panelId);

  // Drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();

      setIsDragging(true);
      setDragOffset({
        x: e.clientX - window.position.x,
        y: e.clientY - window.position.y,
      });

      startDragging(window.id);
    },
    [window.position, window.id, startDragging],
  );

  // Resize start
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  // Mouse move and up handlers
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        onPositionChange({ x: Math.max(0, newX), y: Math.max(0, newY) });
      }

      if (isResizing) {
        const newWidth = Math.max(200, e.clientX - window.position.x);
        const newHeight = Math.max(150, e.clientY - window.position.y);
        onSizeChange({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      if (isDragging && layoutState.dropTarget && layoutState.dropTarget.position !== "center") {
        // Dock the window
        dockWindow(window.id, layoutState.dropTarget.panelId, layoutState.dropTarget.position);
      }

      setIsDragging(false);
      setIsResizing(false);
      endDragging();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDragging,
    isResizing,
    dragOffset,
    window.position,
    window.id,
    onPositionChange,
    onSizeChange,
    endDragging,
    layoutState.dropTarget,
    dockWindow,
  ]);

  if (window.isMinimized) {
    return null;
  }

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
        className="flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-border-default cursor-grab active:cursor-grabbing select-none flex-shrink-0"
      >
        <span className="text-sm font-medium text-text-primary">{title}</span>
        <div className="flex items-center gap-1">
          {/* Close button */}
          <button
            onClick={onClose}
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
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        style={{
          background: "linear-gradient(135deg, transparent 50%, rgba(100,100,100,0.5) 50%)",
        }}
      />
    </div>
  );
}
