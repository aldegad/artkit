"use client";

import { useState, useRef, useCallback, ReactNode, useEffect } from "react";

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  shortcut?: string;
  delay?: number;
  longPressDelay?: number;
}

type TooltipMode = "hidden" | "hover" | "brief" | "popup";

export default function Tooltip({
  children,
  content,
  shortcut,
  delay = 300,
  longPressDelay = 500,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [mode, setMode] = useState<TooltipMode>("hidden");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  const modeRef = useRef<TooltipMode>("hidden");
  const lastTouchRef = useRef<number>(0); // Track last touch time to ignore mouse events

  // Keep modeRef in sync for use in event handlers
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const tooltipWidth = 200;
      const padding = 12;

      let x = rect.left + rect.width / 2;
      let y = rect.bottom + 8;

      if (x - tooltipWidth / 2 < padding) {
        x = padding + tooltipWidth / 2;
      } else if (x + tooltipWidth / 2 > window.innerWidth - padding) {
        x = window.innerWidth - padding - tooltipWidth / 2;
      }

      if (y + 100 > window.innerHeight) {
        y = rect.top - 8;
      }

      setPosition({ x, y });
    }
  }, []);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    modeRef.current = "hidden"; // Update ref immediately
    setIsVisible(false);
    setMode("hidden");
  }, []);

  // Mouse handlers (desktop)
  const handleMouseEnter = useCallback(() => {
    console.log("[Tooltip] mouseEnter", {
      lastTouch: lastTouchRef.current,
      timeSinceTouch: Date.now() - lastTouchRef.current,
      delay,
    });
    // Ignore mouse events shortly after touch (mobile browsers emit both)
    if (Date.now() - lastTouchRef.current < 500) {
      console.log("[Tooltip] ignored - too soon after touch");
      return;
    }
    timeoutRef.current = setTimeout(() => {
      console.log("[Tooltip] showing tooltip");
      updatePosition();
      console.log("[Tooltip] position after update:", position, "triggerRef:", triggerRef.current?.getBoundingClientRect());
      setMode("hover");
      setIsVisible(true);
    }, delay);
  }, [delay, updatePosition]);

  const handleMouseLeave = useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  // Touch handlers (mobile) - only show tooltip on long press
  const handleTouchStart = useCallback(
    () => {
      // Record touch time to ignore subsequent mouse events
      lastTouchRef.current = Date.now();

      // Clear any existing timers
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (longPressRef.current) clearTimeout(longPressRef.current);

      // Start long press timer - only show tooltip after holding
      longPressRef.current = setTimeout(() => {
        updatePosition();
        modeRef.current = "popup";
        setMode("popup");
        setIsVisible(true);
        longPressRef.current = null;
      }, longPressDelay);
    },
    [longPressDelay, updatePosition]
  );

  const handleTouchEnd = useCallback(() => {
    // Clear long press timer (short tap cancels)
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    // Popup stays visible until outside tap
  }, []);

  const handleTouchMove = useCallback(() => {
    // Cancel long press if finger moves
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  // Close popup on outside tap
  useEffect(() => {
    if (mode === "popup") {
      const handleOutsideTouch = (e: TouchEvent) => {
        const target = e.target as Node;
        if (
          !triggerRef.current?.contains(target) &&
          !tooltipRef.current?.contains(target)
        ) {
          modeRef.current = "hidden"; // Update ref immediately
          setIsVisible(false);
          setMode("hidden");
        }
      };

      // Use setTimeout to avoid the current touch event triggering close
      const timer = setTimeout(() => {
        document.addEventListener("touchstart", handleOutsideTouch);
      }, 50);

      return () => {
        clearTimeout(timer);
        document.removeEventListener("touchstart", handleOutsideTouch);
      };
    }
  }, [mode]);

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

  const isPopupMode = mode === "popup";

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        className="inline-flex"
      >
        {children}
      </div>
      {isVisible && (
        <>
          {/* 모바일 모달: 중앙에 표시 */}
          {isPopupMode ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150"
              onClick={hideTooltip}
            >
              <div
                ref={tooltipRef}
                className="relative mx-4 px-4 py-3 bg-surface-primary border border-border-default rounded-xl shadow-2xl text-sm max-w-[320px] animate-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-text-primary leading-relaxed pr-6">{content}</div>
                  </div>
                  {shortcut && (
                    <div className="flex items-center gap-2 pt-1 border-t border-border-default">
                      <span className="text-text-tertiary text-xs">단축키:</span>
                      <kbd className="px-2 py-1 bg-surface-tertiary text-text-secondary rounded text-xs font-mono border border-border-default">
                        {shortcut}
                      </kbd>
                    </div>
                  )}
                </div>
                <button
                  onClick={hideTooltip}
                  className="absolute top-2 right-2 w-6 h-6 bg-surface-secondary border border-border-default rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-tertiary transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            /* 데스크탑 hover: 기존 위치 기반 툴팁 */
            <div
              ref={tooltipRef}
              className="fixed z-50 px-3 py-2 bg-surface-primary border border-border-default rounded-lg shadow-xl text-xs max-w-[280px] pointer-events-none animate-in fade-in zoom-in-95 duration-150"
              style={{
                left: position.x,
                top: position.y,
                transform:
                  position.y < 100
                    ? "translateX(-50%)"
                    : "translateX(-50%) translateY(-100%) translateY(-16px)",
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
      )}
    </>
  );
}
