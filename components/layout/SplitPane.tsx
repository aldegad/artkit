"use client";

import { useState, useCallback, useEffect, ReactNode } from "react";
import { useDocking } from "../../contexts/DockingContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { DockPosition } from "../../types";

// ============================================
// Types
// ============================================

interface SplitPaneProps {
  position: DockPosition;
  children: ReactNode;
  onClose?: () => void;
}

// ============================================
// Component
// ============================================

export default function SplitPane({ position, children, onClose }: SplitPaneProps) {
  const { getDockedPanels, resizeDockedPanel, undockWindow } = useDocking();
  const { t } = useLanguage();
  const panels = getDockedPanels(position);

  const [isResizing, setIsResizing] = useState(false);
  const [size, setSize] = useState(panels[0]?.size || 300);

  const isHorizontal = position === "left" || position === "right";

  // 리사이즈 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      let newSize: number;
      if (position === "left") {
        newSize = e.clientX;
      } else if (position === "right") {
        newSize = window.innerWidth - e.clientX;
      } else if (position === "top") {
        newSize = e.clientY;
      } else {
        newSize = window.innerHeight - e.clientY;
      }

      newSize = Math.max(150, Math.min(600, newSize));
      setSize(newSize);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // 리사이즈 결과 저장
      if (panels[0]) {
        resizeDockedPanel(panels[0].id, size);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, position, panels, resizeDockedPanel, size]);

  if (panels.length === 0) return null;

  const panel = panels[0]; // 현재는 각 위치에 하나의 패널만 지원

  // 리사이즈 핸들 위치
  const resizeHandleClass = {
    left: "right-0 top-0 w-1 h-full cursor-ew-resize",
    right: "left-0 top-0 w-1 h-full cursor-ew-resize",
    top: "left-0 bottom-0 w-full h-1 cursor-ns-resize",
    bottom: "left-0 top-0 w-full h-1 cursor-ns-resize",
  }[position];

  // 컨테이너 스타일
  const containerStyle = isHorizontal
    ? { width: size, flexShrink: 0 }
    : { height: size, flexShrink: 0 };

  return (
    <div
      className="relative bg-surface-primary border-border-default flex flex-col"
      style={{
        ...containerStyle,
        borderLeftWidth: position === "right" ? 1 : 0,
        borderRightWidth: position === "left" ? 1 : 0,
        borderTopWidth: position === "bottom" ? 1 : 0,
        borderBottomWidth: position === "top" ? 1 : 0,
      }}
    >
      {/* 패널 헤더 */}
      <div className="panel-header">
        <span className="text-sm font-medium text-text-primary">{panel.title}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => undockWindow(panel.id)}
            className="p-1 hover:bg-interactive-hover rounded text-text-secondary hover:text-text-primary"
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
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-accent-danger rounded text-text-secondary hover:text-white"
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
          )}
        </div>
      </div>

      {/* 패널 컨텐츠 */}
      <div className="flex-1 overflow-auto">{children}</div>

      {/* 리사이즈 핸들 */}
      <div
        onMouseDown={handleResizeStart}
        className={`absolute ${resizeHandleClass} bg-border-default hover:bg-accent-primary z-10 transition-colors`}
      />
    </div>
  );
}
