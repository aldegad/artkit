"use client";

import { useState } from "react";
import {
  MenuDropdown,
  SpinnerIcon,
  type MenuItem,
} from "../../../shared/components";
import { shortcutToDisplayString, bindingToDisplayString, COMMON_SHORTCUTS } from "@/shared/utils/keyboard";

interface VideoMenuBarProps {
  // File menu
  onNew: () => void;
  onLoad: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onImportMedia: () => void;
  onExport: () => void;
  canSave: boolean;
  isSaving?: boolean;
  isLoading?: boolean;
  // Edit menu
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  hasSelection: boolean;
  hasClipboard?: boolean;
  // View menu
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onToggleTimeline: () => void;
  showTimeline: boolean;
  onResetLayout: () => void;
  onTogglePreviewCache: () => void;
  previewCacheEnabled: boolean;
  translations: {
    file: string;
    edit: string;
    view: string;
    window: string;
    settings: string;
    new: string;
    load: string;
    save: string;
    saveAs: string;
    importMedia: string;
    exportVideo: string;
    undo: string;
    redo: string;
    cut: string;
    copy: string;
    paste: string;
    delete: string;
    zoomIn: string;
    zoomOut: string;
    fitToScreen: string;
    timeline: string;
    previewVideoCache: string;
    resetLayout: string;
  };
}

export default function VideoMenuBar({
  onNew,
  onLoad,
  onSave,
  onSaveAs,
  onImportMedia,
  onExport,
  canSave,
  isSaving,
  isLoading,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  hasSelection,
  hasClipboard,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onToggleTimeline,
  showTimeline,
  onResetLayout,
  onTogglePreviewCache,
  previewCacheEnabled,
  translations: t,
}: VideoMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"file" | "edit" | "view" | "window" | "settings" | null>(null);

  const d = shortcutToDisplayString;
  const db = bindingToDisplayString;
  const fileMenuItems: MenuItem[] = [
    { label: t.new, onClick: onNew, shortcut: d(COMMON_SHORTCUTS.newFile) },
    { label: t.load, onClick: onLoad, shortcut: d(COMMON_SHORTCUTS.open) },
    { divider: true },
    { label: t.save, onClick: onSave, disabled: !canSave || isSaving, shortcut: d(COMMON_SHORTCUTS.save) },
    { label: t.saveAs, onClick: onSaveAs, disabled: !canSave || isSaving, shortcut: d(COMMON_SHORTCUTS.saveAs) },
    { divider: true },
    { label: t.importMedia, onClick: onImportMedia },
    { label: t.exportVideo, onClick: onExport, disabled: !canSave },
  ];

  const editMenuItems: MenuItem[] = [
    { label: t.undo, onClick: onUndo, disabled: !canUndo, shortcut: d(COMMON_SHORTCUTS.undo) },
    { label: t.redo, onClick: onRedo, disabled: !canRedo, shortcut: db(COMMON_SHORTCUTS.redo) },
    { divider: true },
    { label: t.cut, onClick: onCut, disabled: !hasSelection, shortcut: d(COMMON_SHORTCUTS.cut) },
    { label: t.copy, onClick: onCopy, disabled: !hasSelection, shortcut: d(COMMON_SHORTCUTS.copy) },
    { label: t.paste, onClick: onPaste, disabled: !hasClipboard, shortcut: d(COMMON_SHORTCUTS.paste) },
    { label: t.delete, onClick: onDelete, disabled: !hasSelection, shortcut: "⌫" },
  ];

  const viewMenuItems: MenuItem[] = [
    { label: t.zoomIn, onClick: onZoomIn, shortcut: d(COMMON_SHORTCUTS.zoomIn) },
    { label: t.zoomOut, onClick: onZoomOut, shortcut: d(COMMON_SHORTCUTS.zoomOut) },
    { label: t.fitToScreen, onClick: onFitToScreen, shortcut: d(COMMON_SHORTCUTS.resetZoom) },
  ];

  const windowMenuItems: MenuItem[] = [
    { label: t.timeline, onClick: onToggleTimeline, checked: showTimeline },
    { divider: true },
    { label: t.resetLayout, onClick: onResetLayout },
  ];

  const settingsMenuItems: MenuItem[] = [
    { label: t.previewVideoCache, onClick: onTogglePreviewCache, checked: previewCacheEnabled },
  ];

  return (
    <div className="flex items-center gap-1">
      {(isLoading || isSaving) && (
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
      <MenuDropdown
        label={t.settings}
        items={settingsMenuItems}
        isOpen={openMenu === "settings"}
        onOpenChange={(open) => setOpenMenu(open ? "settings" : null)}
      />
    </div>
  );
}
