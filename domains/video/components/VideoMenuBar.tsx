"use client";

import { useState } from "react";
import { useKeymap } from "../../../shared/contexts";
import {
  MenuDropdown,
  SpinnerIcon,
  type MenuItem,
} from "../../../shared/components";

interface VideoMenuBarProps {
  // File menu
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onImportMedia: () => void;
  onExport: () => void;
  canSave: boolean;
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
  translations: {
    file: string;
    edit: string;
    view: string;
    newProject: string;
    openProject: string;
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
  };
}

export default function VideoMenuBar({
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onImportMedia,
  onExport,
  canSave,
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
  translations: t,
}: VideoMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"file" | "edit" | "view" | null>(null);
  const { resolvedKeymap } = useKeymap();
  const cmd = resolvedKeymap === "mac" ? "⌘" : "Ctrl+";
  const shiftCmd = resolvedKeymap === "mac" ? "⇧⌘" : "Ctrl+Shift+";
  const deleteKey = resolvedKeymap === "mac" ? "⌫" : "Delete";

  const fileMenuItems: MenuItem[] = [
    { label: t.newProject, onClick: onNew, shortcut: `${cmd}N` },
    { label: t.openProject, onClick: onOpen, shortcut: `${cmd}O` },
    { divider: true },
    { label: t.save, onClick: onSave, disabled: !canSave, shortcut: `${cmd}S` },
    { label: t.saveAs, onClick: onSaveAs, disabled: !canSave, shortcut: `${shiftCmd}S` },
    { divider: true },
    { label: t.importMedia, onClick: onImportMedia },
    { label: t.exportVideo, onClick: onExport, disabled: !canSave },
  ];

  const editMenuItems: MenuItem[] = [
    { label: t.undo, onClick: onUndo, disabled: !canUndo, shortcut: `${cmd}Z` },
    { label: t.redo, onClick: onRedo, disabled: !canRedo, shortcut: `${shiftCmd}Z` },
    { divider: true },
    { label: t.cut, onClick: onCut, disabled: !hasSelection, shortcut: `${cmd}X` },
    { label: t.copy, onClick: onCopy, disabled: !hasSelection, shortcut: `${cmd}C` },
    { label: t.paste, onClick: onPaste, disabled: !hasClipboard, shortcut: `${cmd}V` },
    { label: t.delete, onClick: onDelete, disabled: !hasSelection, shortcut: deleteKey },
  ];

  const viewMenuItems: MenuItem[] = [
    { label: t.zoomIn, onClick: onZoomIn, shortcut: `${cmd}+` },
    { label: t.zoomOut, onClick: onZoomOut, shortcut: `${cmd}-` },
    { label: t.fitToScreen, onClick: onFitToScreen, shortcut: `${cmd}0` },
    { divider: true },
    { label: t.timeline, onClick: onToggleTimeline, checked: showTimeline },
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
    </div>
  );
}
