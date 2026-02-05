"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
  cloneElement,
  isValidElement,
  ReactElement,
} from "react";
import { createPortal } from "react-dom";

// ============================================
// Types
// ============================================

export interface PopoverProps {
  /** Trigger element - will be cloned with onClick handler */
  trigger: ReactElement;
  /** Popover content */
  children: ReactNode;
  /** Controlled open state */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Horizontal alignment relative to trigger */
  align?: "start" | "center" | "end";
  /** Preferred side to show popover */
  side?: "top" | "bottom";
  /** Offset from trigger element */
  sideOffset?: number;
  /** Additional class name for popover container */
  className?: string;
  /** Whether to close on scroll */
  closeOnScroll?: boolean;
}

interface Position {
  top: number;
  left: number;
  side: "top" | "bottom";
}

// ============================================
// Component
// ============================================

export function Popover({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  align = "start",
  side = "bottom",
  sideOffset = 4,
  className = "",
  closeOnScroll = true,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0, side: "bottom" });
  const [mounted, setMounted] = useState(false);
  const [positionReady, setPositionReady] = useState(false);

  const triggerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Controlled or uncontrolled
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (value: boolean) => {
      if (!isControlled) {
        setInternalOpen(value);
      }
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange]
  );

  // Client-side only
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !contentRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const contentRect = contentRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 8;

    // Determine vertical position
    let actualSide = side;
    let top: number;

    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    if (side === "bottom" && spaceBelow < contentRect.height + padding && spaceAbove > spaceBelow) {
      actualSide = "top";
    } else if (side === "top" && spaceAbove < contentRect.height + padding && spaceBelow > spaceAbove) {
      actualSide = "bottom";
    }

    if (actualSide === "bottom") {
      top = triggerRect.bottom + sideOffset;
    } else {
      top = triggerRect.top - contentRect.height - sideOffset;
    }

    // Determine horizontal position
    let left: number;
    switch (align) {
      case "start":
        left = triggerRect.left;
        break;
      case "center":
        left = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2;
        break;
      case "end":
        left = triggerRect.right - contentRect.width;
        break;
    }

    // Keep within viewport
    if (left < padding) {
      left = padding;
    } else if (left + contentRect.width > viewportWidth - padding) {
      left = viewportWidth - contentRect.width - padding;
    }

    setPosition({ top, left, side: actualSide });
    setPositionReady(true);
  }, [align, side, sideOffset]);

  // Update position when open
  useEffect(() => {
    if (isOpen) {
      // Initial position calculation
      requestAnimationFrame(updatePosition);
    } else {
      // Reset for next open
      setPositionReady(false);
    }
  }, [isOpen, updatePosition]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setOpen]);

  // Close on scroll
  useEffect(() => {
    if (!isOpen || !closeOnScroll) return;

    const handleScroll = () => setOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isOpen, closeOnScroll, setOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        contentRef.current &&
        !contentRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    // Delay to avoid immediate close from trigger click
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
    };
  }, [isOpen, setOpen]);

  // Clone trigger with ref and onClick
  const triggerElement = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<{ ref?: React.Ref<HTMLElement>; onClick?: () => void }>, {
        ref: triggerRef,
        onClick: () => {
          const originalOnClick = (trigger.props as { onClick?: () => void }).onClick;
          originalOnClick?.();
          setOpen(!isOpen);
        },
      })
    : trigger;

  if (!mounted) {
    return <>{triggerElement}</>;
  }

  return (
    <>
      {triggerElement}
      {isOpen &&
        createPortal(
          <>
            {/* Backdrop - invisible but captures clicks */}
            <div className="fixed inset-0 z-40" aria-hidden="true" />
            {/* Content */}
            <div
              ref={contentRef}
              className={`fixed z-50 bg-surface-primary border border-border-default rounded-lg shadow-lg ${positionReady ? "animate-popover" : "opacity-0"} ${className}`}
              style={{
                top: position.top,
                left: position.left,
              }}
            >
              {children}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
