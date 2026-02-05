"use client";

import { useState } from "react";
import { Popover, SpinnerIcon, CheckIcon } from "../../../shared/components";

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
  // View menu props
  showRulers: boolean;
  showGuides: boolean;
  lockGuides: boolean;
  snapToGuides: boolean;
  onToggleRulers: () => void;
  onToggleGuides: () => void;
  onToggleLockGuides: () => void;
  onToggleSnapToGuides: () => void;
  onClearGuides: () => void;
  translations: {
    file: string;
    view: string;
    window: string;
    new: string;
    load: string;
    save: string;
    saveAs: string;
    importImage: string;
    layers: string;
    showRulers: string;
    showGuides: string;
    lockGuides: string;
    snapToGuides: string;
    clearGuides: string;
  };
}

// ============================================
// Menu Dropdown Component (Popover-based)
// ============================================

interface MenuDropdownProps {
  label: string;
  items: MenuItem[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

function MenuDropdown({ label, items, isOpen, onOpenChange }: MenuDropdownProps) {
  return (
    <Popover
      trigger={
        <button
          className={`px-3 py-1 text-sm transition-colors rounded ${
            isOpen
              ? "bg-interactive-hover text-text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-interactive-hover"
          }`}
        >
          {label}
        </button>
      }
      open={isOpen}
      onOpenChange={onOpenChange}
      align="start"
      sideOffset={4}
      closeOnScroll={false}
    >
      <div className="min-w-[180px] py-1">
        {items.map((item, index) =>
          item.divider ? (
            <div key={index} className="my-1 border-t border-border-default" />
          ) : (
            <button
              key={index}
              onClick={() => {
                if (!item.disabled && item.onClick) {
                  item.onClick();
                  onOpenChange(false);
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
    </Popover>
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
  showRulers,
  showGuides,
  lockGuides,
  snapToGuides,
  onToggleRulers,
  onToggleGuides,
  onToggleLockGuides,
  onToggleSnapToGuides,
  onClearGuides,
  translations: t,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"file" | "view" | "window" | null>(null);

  const fileMenuItems: MenuItem[] = [
    { label: t.new, onClick: onNew, shortcut: "⌘N" },
    { label: t.load, onClick: onLoad },
    { divider: true },
    { label: t.save, onClick: onSave, disabled: !canSave, shortcut: "⌘S" },
    { label: t.saveAs, onClick: onSaveAs, disabled: !canSave, shortcut: "⇧⌘S" },
    { divider: true },
    { label: t.importImage, onClick: onImportImage },
  ];

  const viewMenuItems: MenuItem[] = [
    { label: t.showRulers, onClick: onToggleRulers, checked: showRulers },
    { label: t.showGuides, onClick: onToggleGuides, checked: showGuides },
    { label: t.lockGuides, onClick: onToggleLockGuides, checked: lockGuides, disabled: !showGuides },
    { label: t.snapToGuides, onClick: onToggleSnapToGuides, checked: snapToGuides, disabled: !showGuides },
    { divider: true },
    { label: t.clearGuides, onClick: onClearGuides, disabled: !showGuides },
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
      />
      <MenuDropdown
        label={t.view}
        items={viewMenuItems}
        isOpen={openMenu === "view"}
        onOpenChange={(open) => setOpenMenu(open ? "view" : null)}
      />
      <MenuDropdown
        label={t.window}
        items={windowMenuItems}
        isOpen={openMenu === "window"}
        onOpenChange={(open) => setOpenMenu(open ? "window" : null)}
      />
    </div>
  );
}
