"use client";

import { useCallback, useEffect } from "react";

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
  children,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="bg-surface-primary border border-border-default rounded-xl shadow-xl flex flex-col"
        style={{ width, maxHeight }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
          {typeof title === "string" ? (
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          ) : (
            title
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
          >
            ×
          </button>
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
    </div>
  );
}
