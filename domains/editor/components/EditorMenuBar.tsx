"use client";

import { useState, useRef, useEffect } from "react";

// ============================================
// Types
// ============================================

type MenuItem =
  | {
      label: string;
      onClick?: () => void;
      disabled?: boolean;
      checked?: boolean;
      shortcut?: string;
      divider?: false;
    }
  | {
      divider: true;
      label?: never;
      onClick?: never;
    };

interface MenuBarProps {
  onNew: () => void;
  onLoad: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onImportImage: () => void;
  onToggleLayers: () => void;
  isLayersOpen: boolean;
  canSave: boolean;
  isLoading?: boolean;
  translations: {
    file: string;
    window: string;
    new: string;
    load: string;
    save: string;
    saveAs: string;
    importImage: string;
    layers: string;
  };
}

// ============================================
// Icons
// ============================================

const SpinnerIcon = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

// ============================================
// Menu Dropdown Component
// ============================================

interface MenuDropdownProps {
  label: string;
  items: MenuItem[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}

function MenuDropdown({ label, items, isOpen, onOpenChange, onClose }: MenuDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Delay to avoid immediate close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => onOpenChange(!isOpen)}
        className={`px-3 py-1 text-sm transition-colors rounded ${
          isOpen
            ? "bg-interactive-hover text-text-primary"
            : "text-text-secondary hover:text-text-primary hover:bg-interactive-hover"
        }`}
      >
        {label}
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 mt-1 min-w-[180px] bg-surface-primary border border-border-default rounded-lg shadow-lg py-1 z-50"
        >
          {items.map((item, index) =>
            item.divider ? (
              <div key={index} className="my-1 border-t border-border-default" />
            ) : (
              <button
                key={index}
                onClick={() => {
                  if (!item.disabled && item.onClick) {
                    item.onClick();
                    onClose();
                  }
                }}
                disabled={item.disabled}
                className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 transition-colors ${
                  item.disabled
                    ? "text-text-quaternary cursor-not-allowed"
                    : "text-text-primary hover:bg-interactive-hover"
                }`}
              >
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  {item.checked && <CheckIcon />}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="text-text-quaternary text-xs">{item.shortcut}</span>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function EditorMenuBar({
  onNew,
  onLoad,
  onSave,
  onSaveAs,
  onImportImage,
  onToggleLayers,
  isLayersOpen,
  canSave,
  isLoading,
  translations: t,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"file" | "window" | null>(null);

  const fileMenuItems: MenuItem[] = [
    { label: t.new, onClick: onNew, shortcut: "⌘N" },
    { label: t.load, onClick: onLoad },
    { divider: true },
    { label: t.save, onClick: onSave, disabled: !canSave, shortcut: "⌘S" },
    { label: t.saveAs, onClick: onSaveAs, disabled: !canSave, shortcut: "⇧⌘S" },
    { divider: true },
    { label: t.importImage, onClick: onImportImage },
  ];

  const windowMenuItems: MenuItem[] = [
    { label: t.layers, onClick: onToggleLayers, checked: isLayersOpen },
  ];

  return (
    <div className="flex items-center gap-1">
      {isLoading && (
        <div className="flex items-center gap-2 px-2 text-text-tertiary">
          <SpinnerIcon />
        </div>
      )}
      <MenuDropdown
        label={t.file}
        items={fileMenuItems}
        isOpen={openMenu === "file"}
        onOpenChange={(open) => setOpenMenu(open ? "file" : null)}
        onClose={() => setOpenMenu(null)}
      />
      <MenuDropdown
        label={t.window}
        items={windowMenuItems}
        isOpen={openMenu === "window"}
        onOpenChange={(open) => setOpenMenu(open ? "window" : null)}
        onClose={() => setOpenMenu(null)}
      />
    </div>
  );
}
