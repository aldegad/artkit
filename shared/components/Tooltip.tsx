"use client";

import { useState, useRef, useCallback, ReactNode, useEffect } from "react";

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  shortcut?: string;
  delay?: number;
  longPressDelay?: number;
}

export default function Tooltip({
  children,
  content,
  shortcut,
  delay = 300,
  longPressDelay = 500,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = useRef(false);

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const tooltipWidth = 200; // approximate max width
      const padding = 12;

      let x = rect.left + rect.width / 2;
      let y = rect.bottom + 8;

      // Adjust if tooltip would go off screen
      if (x - tooltipWidth / 2 < padding) {
        x = padding + tooltipWidth / 2;
      } else if (x + tooltipWidth / 2 > window.innerWidth - padding) {
        x = window.innerWidth - padding - tooltipWidth / 2;
      }

      // If tooltip would go below viewport, show above
      if (y + 100 > window.innerHeight) {
        y = rect.top - 8;
      }

      setPosition({ x, y });
    }
  }, []);

  const showTooltip = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      updatePosition();
      setIsVisible(true);
    }, delay);
  }, [delay, updatePosition]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    isLongPressActiveRef.current = false;
    setIsVisible(false);
  }, []);

  // Touch handlers for long press
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      longPressRef.current = setTimeout(() => {
        isLongPressActiveRef.current = true;
        updatePosition();
        setIsVisible(true);
        // Prevent the touch from triggering a click
        e.preventDefault();
      }, longPressDelay);
    },
    [longPressDelay, updatePosition]
  );

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    // Hide after a short delay to let user read
    if (isLongPressActiveRef.current) {
      setTimeout(() => {
        setIsVisible(false);
        isLongPressActiveRef.current = false;
      }, 1500);
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    // Cancel long press if finger moves
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (longPressRef.current) clearTimeout(longPressRef.current);
    };
  }, []);

  // Close on scroll
  useEffect(() => {
    if (isVisible) {
      const handleScroll = () => hideTooltip();
      window.addEventListener("scroll", handleScroll, true);
      return () => window.removeEventListener("scroll", handleScroll, true);
    }
  }, [isVisible, hideTooltip]);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        className="inline-flex"
      >
        {children}
      </div>
      {isVisible && (
        <div
          className="fixed z-50 px-3 py-2 bg-surface-primary border border-border-default rounded-lg shadow-xl text-xs pointer-events-none max-w-[280px] animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: position.x,
            top: position.y,
            transform: position.y < 100 ? "translateX(-50%)" : "translateX(-50%) translateY(-100%) translateY(-16px)",
          }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-3">
              <div className="text-text-primary leading-relaxed">{content}</div>
              {shortcut && (
                <kbd className="px-1.5 py-0.5 bg-surface-tertiary text-text-tertiary rounded text-[10px] font-mono shrink-0 border border-border-default">
                  {shortcut}
                </kbd>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
