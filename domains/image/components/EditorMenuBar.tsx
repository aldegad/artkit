"use client";

import { useState } from "react";
import {
  MenuDropdown,
  SpinnerIcon,
  type MenuItem,
} from "../../../shared/components";
import { shortcutToDisplayString, bindingToDisplayString, COMMON_SHORTCUTS } from "@/shared/utils/keyboard";

// ============================================
// Types
// ============================================

interface MenuBarProps {
  onNew: () => void;
  onLoad: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onImportImage: () => void;
  onExport: () => void;
  onExportLayers: () => void;
  onToggleLayers: () => void;
  isLayersOpen: boolean;
  canSave: boolean;
  hasSelectedLayers: boolean;
  isLoading?: boolean;
  // Edit menu props
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
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
  panelHeadersVisible: boolean;
  onTogglePanelHeaders: () => void;
  translations: {
    file: string;
    edit: string;
    view: string;
    window: string;
    new: string;
    load: string;
    save: string;
    saveAs: string;
    importImage: string;
    export: string;
    exportLayers: string;
    undo: string;
    redo: string;
    layers: string;
    showRulers: string;
    showGuides: string;
    lockGuides: string;
    snapToGuides: string;
    clearGuides: string;
    panelHeaders: string;
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
  onImportImage,
  onExport,
  onExportLayers,
  onToggleLayers,
  isLayersOpen,
  canSave,
  hasSelectedLayers,
  isLoading,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  showRulers,
  showGuides,
  lockGuides,
  snapToGuides,
  onToggleRulers,
  onToggleGuides,
  onToggleLockGuides,
  onToggleSnapToGuides,
  onClearGuides,
  panelHeadersVisible,
  onTogglePanelHeaders,
  translations: t,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"file" | "edit" | "view" | "window" | null>(null);

  const d = shortcutToDisplayString;
  const db = bindingToDisplayString;
  const fileMenuItems: MenuItem[] = [
    { label: t.new, onClick: onNew, shortcut: d(COMMON_SHORTCUTS.newFile) },
    { label: t.load, onClick: onLoad },
    { divider: true },
    { label: t.save, onClick: onSave, disabled: !canSave, shortcut: d(COMMON_SHORTCUTS.save) },
    { label: t.saveAs, onClick: onSaveAs, disabled: !canSave, shortcut: d(COMMON_SHORTCUTS.saveAs) },
    { divider: true },
    { label: t.importImage, onClick: onImportImage },
    { divider: true },
    { label: t.export, onClick: onExport, disabled: !canSave, shortcut: d({ code: "KeyE", ctrlOrMeta: true, shift: true }) },
    { label: t.exportLayers, onClick: onExportLayers, disabled: !hasSelectedLayers },
  ];

  const editMenuItems: MenuItem[] = [
    { label: t.undo, onClick: onUndo, disabled: !canUndo, shortcut: d(COMMON_SHORTCUTS.undo) },
    { label: t.redo, onClick: onRedo, disabled: !canRedo, shortcut: db(COMMON_SHORTCUTS.redo) },
  ];

  const viewMenuItems: MenuItem[] = [
    { label: t.panelHeaders, onClick: onTogglePanelHeaders, checked: panelHeadersVisible },
    { divider: true },
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
        label={t.edit}
        items={editMenuItems}
        isOpen={openMenu === "edit"}
        onOpenChange={(open) => setOpenMenu(open ? "edit" : null)}
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
