"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

let bodyScrollLockCount = 0;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

// ============================================
// Types
// ============================================

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  width?: string;
  maxHeight?: string;
  contentClassName?: string;
  footer?: React.ReactNode;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  hideCloseButton?: boolean;
  panelClassName?: string;
  backdropClassName?: string;
  children: React.ReactNode;
}

// ============================================
// Component
// ============================================

export function Modal({
  isOpen,
  onClose,
  title,
  width = "800px",
  maxHeight = "85vh",
  contentClassName = "flex-1 overflow-hidden flex flex-col min-h-0 p-4 gap-4",
  footer,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  hideCloseButton = false,
  panelClassName = "",
  backdropClassName = "",
  children,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;

    bodyScrollLockCount += 1;
    if (bodyScrollLockCount === 1) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
      if (bodyScrollLockCount === 0) {
        document.body.style.overflow = "";
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = requestAnimationFrame(() => {
      const modalEl = modalRef.current;
      if (!modalEl) return;
      const firstFocusable = modalEl.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      } else {
        modalEl.focus();
      }
    });

    return () => cancelAnimationFrame(timer);
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const modalEl = modalRef.current;
      if (!modalEl) return;
      const focusable = Array.from(
        modalEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) {
        e.preventDefault();
        modalEl.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [closeOnEscape, onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${backdropClassName}`}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (!closeOnBackdropClick) return;
        onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={typeof title === "string" ? titleId : undefined}
        tabIndex={-1}
        className={`bg-surface-primary border border-border-default rounded-xl shadow-xl flex flex-col ${panelClassName}`}
        style={{ width, maxHeight }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
          {typeof title === "string" ? (
            <h2 id={titleId} className="text-lg font-semibold text-text-primary">{title}</h2>
          ) : (
            title
          )}
          {!hideCloseButton && (
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
              aria-label="Close dialog"
            >
              ×
            </button>
          )}
        </div>

        {/* Content */}
        <div className={contentClassName}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-4 py-3 border-t border-border-default shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
