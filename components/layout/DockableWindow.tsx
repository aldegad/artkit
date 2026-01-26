"use client";

import { useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { useDocking } from "../../contexts/DockingContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { Point, Size } from "../../types";

// ============================================
// Types
// ============================================

interface DockableWindowProps {
  id: string;
  title: string;
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  initialPosition?: Point;
  initialSize?: Size;
  minSize?: Size;
}

// ============================================
// Component
// ============================================

export default function DockableWindow({
  id,
  title,
  children,
  isOpen,
  onClose,
  initialPosition = { x: 100, y: 100 },
  initialSize = { width: 400, height: 450 },
  minSize = { width: 200, height: 150 },
}: DockableWindowProps) {
  const {
    isWindowDocked,
    getWindowDockPosition,
    startDragging,
    updateDragPosition,
    endDragging,
    dockWindow,
    undockWindow,
    activeDropZone,
  } = useDocking();
  const { t } = useLanguage();

  const [position, setPosition] = useState<Point>(initialPosition);
  const [size, setSize] = useState<Size>(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

  const windowRef = useRef<HTMLDivElement>(null);

  const isDocked = isWindowDocked(id);
  const dockPosition = getWindowDockPosition(id);

  // 드래그 시작
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const rect = windowRef.current?.getBoundingClientRect();
      if (!rect) return;

      setIsDragging(true);
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });

      startDragging(id);
    },
    [id, startDragging],
  );

  // 드래그 이동
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      setPosition({ x: newX, y: newY });

      updateDragPosition(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false);
      const dropZone = endDragging({ x: e.clientX, y: e.clientY });

      if (dropZone) {
        dockWindow(id, dropZone, title);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset, id, title, updateDragPosition, endDragging, dockWindow]);

  // 리사이즈 핸들러
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      setSize({
        width: Math.max(minSize.width, e.clientX - position.x),
        height: Math.max(minSize.height, e.clientY - position.y),
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, position, minSize]);

  // 도킹 해제 (타이틀바 드래그)
  const handleUndock = useCallback(() => {
    if (isDocked) {
      undockWindow(id);
    }
  }, [id, isDocked, undockWindow]);

  if (!isOpen) return null;

  // 도킹된 상태면 다른 렌더링
  if (isDocked && dockPosition) {
    return null; // 도킹된 윈도우는 EditorLayout에서 렌더링
  }

  return (
    <div
      ref={windowRef}
      className={`
        fixed bg-surface-primary border border-border-default rounded-lg shadow-2xl overflow-hidden flex flex-col z-50
        ${isDragging ? "opacity-80 cursor-grabbing" : ""}
        ${activeDropZone ? "ring-2 ring-accent-primary" : ""}
      `}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
    >
      {/* 타이틀바 */}
      <div
        onMouseDown={isDocked ? handleUndock : handleMouseDown}
        className="flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-border-default cursor-grab active:cursor-grabbing select-none"
      >
        <span className="text-sm font-medium text-text-primary">{title}</span>
        <div className="flex items-center gap-1">
          {isDocked && (
            <button
              onClick={handleUndock}
              className="p-1 hover:bg-interactive-hover rounded text-text-secondary hover:text-text-primary transition-colors"
              title={t.undock}
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
          )}
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

      {/* 컨텐츠 */}
      <div className="flex-1 overflow-auto">{children}</div>

      {/* 리사이즈 핸들 */}
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
