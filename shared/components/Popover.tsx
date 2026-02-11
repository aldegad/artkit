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
  side?: "top" | "bottom" | "left" | "right";
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
  side: "top" | "bottom" | "left" | "right";
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

    // Determine side
    let actualSide = side;
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const spaceLeft = triggerRect.left;
    const spaceRight = viewportWidth - triggerRect.right;

    if (side === "bottom" && spaceBelow < contentRect.height + padding && spaceAbove > spaceBelow) {
      actualSide = "top";
    } else if (side === "top" && spaceAbove < contentRect.height + padding && spaceBelow > spaceAbove) {
      actualSide = "bottom";
    } else if (side === "right" && spaceRight < contentRect.width + padding && spaceLeft > spaceRight) {
      actualSide = "left";
    } else if (side === "left" && spaceLeft < contentRect.width + padding && spaceRight > spaceLeft) {
      actualSide = "right";
    }

    // Determine base position
    let top = 0;
    let left = 0;
    if (actualSide === "top" || actualSide === "bottom") {
      top = actualSide === "bottom"
        ? triggerRect.bottom + sideOffset
        : triggerRect.top - contentRect.height - sideOffset;

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
    } else {
      left = actualSide === "right"
        ? triggerRect.right + sideOffset
        : triggerRect.left - contentRect.width - sideOffset;

      switch (align) {
        case "start":
          top = triggerRect.top;
          break;
        case "center":
          top = triggerRect.top + triggerRect.height / 2 - contentRect.height / 2;
          break;
        case "end":
          top = triggerRect.bottom - contentRect.height;
          break;
      }
    }

    // Keep within viewport
    if (left < padding) {
      left = padding;
    } else if (left + contentRect.width > viewportWidth - padding) {
      left = viewportWidth - contentRect.width - padding;
    }
    if (top < padding) {
      top = padding;
    } else if (top + contentRect.height > viewportHeight - padding) {
      top = viewportHeight - contentRect.height - padding;
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
    ? cloneElement(trigger as ReactElement<{ ref?: React.Ref<HTMLElement>; onClick?: (e: React.MouseEvent) => void }>, {
        ref: triggerRef,
        onClick: (e: React.MouseEvent) => {
          const originalOnClick = (trigger.props as { onClick?: (e: React.MouseEvent) => void }).onClick;
          originalOnClick?.(e);
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
