"use client";

import { useState, useRef, useEffect, ReactNode, useCallback } from "react";
import { useLanguage } from "../shared/contexts";

// ============================================
// Docking Detection
// ============================================

const DOCK_THRESHOLD = 50; // 화면 가장자리 감지 거리

type DockZone = "left" | "right" | "top" | "bottom" | null;

function detectDockZone(
  mouseX: number,
  mouseY: number,
  viewportWidth: number,
  viewportHeight: number,
): DockZone {
  if (mouseX < DOCK_THRESHOLD) return "left";
  if (mouseX > viewportWidth - DOCK_THRESHOLD) return "right";
  if (mouseY < DOCK_THRESHOLD) return "top";
  if (mouseY > viewportHeight - DOCK_THRESHOLD) return "bottom";
  return null;
}

// ============================================
// Window Component
// ============================================

interface WindowProps {
  title: string;
  children: ReactNode;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  isOpen: boolean;
  onClose?: () => void;
  resizable?: boolean;
  className?: string;
  // 도킹 관련 props
  windowId?: string;
  onDock?: (zone: DockZone, windowId: string) => void;
  isDocked?: boolean;
  dockPosition?: DockZone;
  dockedSize?: number;
  onUndock?: () => void;
  onDockedResize?: (newSize: number) => void;
}

export default function Window({
  title,
  children,
  initialPosition = { x: 100, y: 100 },
  initialSize = { width: 300, height: 200 },
  minSize = { width: 150, height: 100 },
  isOpen,
  onClose,
  resizable = true,
  className = "",
  windowId = "",
  onDock,
  isDocked = false,
  dockPosition,
  dockedSize = 300,
  onUndock,
  onDockedResize,
}: WindowProps) {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeDropZone, setActiveDropZone] = useState<DockZone>(null);

  const windowRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  // 드래그 시작
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      // 도킹된 상태에서 드래그하면 언도킹
      if (isDocked && onUndock) {
        onUndock();
        // 언도킹 후 바로 드래그 시작
        setPosition({ x: e.clientX - 100, y: e.clientY - 20 });
      }

      setIsDragging(true);
      setDragOffset({
        x: isDocked ? 100 : e.clientX - position.x,
        y: isDocked ? 20 : e.clientY - position.y,
      });
    },
    [isDocked, onUndock, position],
  );

  // 리사이즈 시작 (도킹된 패널용)
  const handleDockedResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setDragOffset({ x: e.clientX, y: e.clientY });
  }, []);

  // 플로팅 윈도우 리사이즈 시작
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setDragOffset({
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  // 마우스 이동
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        setPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });

        // 도킹 영역 감지
        if (onDock) {
          const zone = detectDockZone(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
          setActiveDropZone(zone);
        }
      }

      if (isResizing) {
        if (isDocked && dockPosition && onDockedResize) {
          // 도킹된 패널 리사이즈
          let newSize: number;
          if (dockPosition === "left") {
            newSize = e.clientX;
          } else if (dockPosition === "right") {
            newSize = window.innerWidth - e.clientX;
          } else if (dockPosition === "top") {
            newSize = e.clientY;
          } else {
            newSize = window.innerHeight - e.clientY;
          }
          onDockedResize(Math.max(150, Math.min(600, newSize)));
        } else {
          // 플로팅 윈도우 리사이즈
          const dx = e.clientX - dragOffset.x;
          const dy = e.clientY - dragOffset.y;
          setSize((prev) => ({
            width: Math.max(minSize.width, prev.width + dx),
            height: Math.max(minSize.height, prev.height + dy),
          }));
          setDragOffset({ x: e.clientX, y: e.clientY });
        }
      }
    };

    const handleMouseUp = (_e: MouseEvent) => {
      // 드래그 종료 시 도킹 처리
      if (isDragging && activeDropZone && onDock) {
        onDock(activeDropZone, windowId);
      }

      setIsDragging(false);
      setIsResizing(false);
      setActiveDropZone(null);
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
    minSize,
    activeDropZone,
    onDock,
    windowId,
    isDocked,
    dockPosition,
    onDockedResize,
  ]);

  if (!isOpen) return null;

  // 도킹된 상태 렌더링
  if (isDocked && dockPosition) {
    const isHorizontal = dockPosition === "left" || dockPosition === "right";

    // 리사이즈 핸들 위치
    const resizeHandleClass = {
      left: "right-0 top-0 w-1 h-full cursor-ew-resize",
      right: "left-0 top-0 w-1 h-full cursor-ew-resize",
      top: "left-0 bottom-0 w-full h-1 cursor-ns-resize",
      bottom: "left-0 top-0 w-full h-1 cursor-ns-resize",
    }[dockPosition];

    const containerStyle = isHorizontal
      ? { width: dockedSize, flexShrink: 0 }
      : { height: dockedSize, flexShrink: 0 };

    return (
      <div
        ref={windowRef}
        className={`relative bg-surface-primary flex flex-col ${className}`}
        style={{
          ...containerStyle,
          borderLeftWidth: dockPosition === "right" ? 1 : 0,
          borderRightWidth: dockPosition === "left" ? 1 : 0,
          borderTopWidth: dockPosition === "bottom" ? 1 : 0,
          borderBottomWidth: dockPosition === "top" ? 1 : 0,
          borderColor: "var(--border-default)",
        }}
      >
        {/* 타이틀 바 */}
        <div
          className="flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-border-default cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleDragStart}
        >
          <span className="text-sm font-medium text-text-primary">{title}</span>
          <div className="flex items-center gap-1">
            {/* Float button */}
            <button
              onClick={onUndock}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
              title={t.floatingMode}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </button>
            {/* 닫기 버튼 */}
            {onClose && (
              <button
                onClick={onClose}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-accent-danger text-text-secondary hover:text-white transition-colors"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-auto">{children}</div>

        {/* 리사이즈 핸들 */}
        <div
          onMouseDown={handleDockedResizeStart}
          className={`absolute ${resizeHandleClass} bg-border-default hover:bg-accent-primary z-10 transition-colors`}
        />
      </div>
    );
  }

  // 플로팅 윈도우 렌더링
  return (
    <>
      {/* 도킹 영역 오버레이 */}
      {isDragging && onDock && (
        <div className="fixed inset-0 pointer-events-none z-40">
          {(["left", "right", "top", "bottom"] as DockZone[]).map((zone) => {
            if (!zone) return null;
            const zoneClasses = {
              left: "left-0 top-0 w-16 h-full",
              right: "right-0 top-0 w-16 h-full",
              top: "left-0 top-0 w-full h-16",
              bottom: "left-0 bottom-0 w-full h-16",
            };
            const labels = {
              left: t.dockLeft,
              right: t.dockRight,
              top: t.dockTop,
              bottom: t.dockBottom,
            };
            return (
              <div
                key={zone}
                className={`
                  absolute ${zoneClasses[zone]}
                  flex items-center justify-center
                  transition-all duration-200
                  ${
                    activeDropZone === zone
                      ? "bg-accent-primary/40 border-2 border-accent-primary"
                      : "bg-surface-tertiary/20"
                  }
                `}
              >
                {activeDropZone === zone && (
                  <span className="text-white text-sm font-medium bg-accent-primary px-3 py-1 rounded-lg shadow-lg">
                    {labels[zone]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 윈도우 */}
      <div
        ref={windowRef}
        className={`fixed bg-surface-primary border border-border-default rounded-xl shadow-xl flex flex-col overflow-hidden z-50 ${
          isDragging ? "opacity-80" : ""
        } ${activeDropZone ? "ring-2 ring-accent-primary" : ""} ${className}`}
        style={{
          left: position.x,
          top: position.y,
          width: isMinimized ? 200 : size.width,
          height: isMinimized ? "auto" : size.height,
        }}
      >
        {/* 타이틀 바 */}
        <div
          className="flex items-center justify-between px-3 py-2 bg-surface-secondary cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleDragStart}
        >
          <span className="text-sm font-medium text-text-primary">{title}</span>
          <div className="flex items-center gap-1">
            {/* 최소화 버튼 */}
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              {isMinimized ? "□" : "─"}
            </button>
            {/* 닫기 버튼 */}
            {onClose && (
              <button
                onClick={onClose}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-accent-danger text-text-secondary hover:text-white transition-colors"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* 컨텐츠 */}
        {!isMinimized && <div className="flex-1 overflow-auto">{children}</div>}

        {/* 리사이즈 핸들 */}
        {!isMinimized && resizable && (
          <div
            onMouseDown={handleResizeStart}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            style={{
              background: "linear-gradient(135deg, transparent 50%, var(--text-tertiary) 50%)",
            }}
          />
        )}
      </div>
    </>
  );
}
