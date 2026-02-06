"use client";

import { useState } from "react";
import { useKeymap } from "../../../shared/contexts";
import {
  MenuDropdown,
  SpinnerIcon,
  type MenuItem,
} from "../../../shared/components";

// ============================================
// Types
// ============================================

interface MenuBarProps {
  onNew: () => void;
  onLoad: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
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
    export: string;
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
// Main Component
// ============================================

export default function EditorMenuBar({
  onNew,
  onLoad,
  onSave,
  onSaveAs,
  onExport,
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
  const { resolvedKeymap } = useKeymap();
  const cmd = resolvedKeymap === "mac" ? "⌘" : "Ctrl+";
  const shiftCmd = resolvedKeymap === "mac" ? "⇧⌘" : "Ctrl+Shift+";

  const fileMenuItems: MenuItem[] = [
    { label: t.new, onClick: onNew, shortcut: `${cmd}N` },
    { label: t.load, onClick: onLoad },
    { divider: true },
    { label: t.save, onClick: onSave, disabled: !canSave, shortcut: `${cmd}S` },
    { label: t.saveAs, onClick: onSaveAs, disabled: !canSave, shortcut: `${shiftCmd}S` },
    { label: t.export, onClick: onExport, disabled: !canSave },
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
