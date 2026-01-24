"use client";

import { useState, useRef, ReactNode } from "react";

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  shortcut?: string;
  delay?: number;
}

export default function Tooltip({ children, content, shortcut, delay = 300 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({
          x: rect.left + rect.width / 2,
          y: rect.bottom + 8,
        });
        setIsVisible(true);
      }
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className="inline-flex"
      >
        {children}
      </div>
      {isVisible && (
        <div
          className="fixed z-50 px-2.5 py-1.5 bg-surface-primary border border-border-default rounded-lg shadow-lg text-xs pointer-events-none"
          style={{
            left: position.x,
            top: position.y,
            transform: "translateX(-50%)",
          }}
        >
          <div className="flex items-start gap-2">
            <div className="text-text-primary">{content}</div>
            {shortcut && (
              <kbd className="px-1.5 py-0.5 bg-surface-tertiary text-text-tertiary rounded text-[10px] font-mono shrink-0">
                {shortcut}
              </kbd>
            )}
          </div>
        </div>
      )}
    </>
  );
}
