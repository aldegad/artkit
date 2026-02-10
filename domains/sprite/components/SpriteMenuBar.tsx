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

interface SpriteMenuBarProps {
  onNew: () => void;
  onLoad: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExportZip: () => void;
  onExportSpriteSheet: () => void;
  onExportSpriteSheetWebp: () => void;
  onImportImage: () => void;
  onImportSheet: () => void;
  onImportVideo: () => void;
  onTogglePreview: () => void;
  onToggleFrameEdit: () => void;
  onResetLayout: () => void;
  isPreviewOpen: boolean;
  isFrameEditOpen: boolean;
  canSave: boolean;
  canExport: boolean;
  isLoading?: boolean;
  // Edit menu props
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  translations: {
    file: string;
    edit: string;
    window: string;
    new: string;
    load: string;
    save: string;
    saveAs: string;
    export: string;
    importImage: string;
    importSheet: string;
    importVideo: string;
    undo: string;
    redo: string;
    preview: string;
    frameEdit: string;
    resetLayout: string;
  };
}

// ============================================
// Main Component
// ============================================

export default function SpriteMenuBar({
  onNew,
  onLoad,
  onSave,
  onSaveAs,
  onExportZip,
  onExportSpriteSheet,
  onExportSpriteSheetWebp,
  onImportImage,
  onImportSheet,
  onImportVideo,
  onTogglePreview,
  onToggleFrameEdit,
  onResetLayout,
  isPreviewOpen,
  isFrameEditOpen,
  canSave,
  canExport,
  isLoading,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  translations: t,
}: SpriteMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"file" | "edit" | "window" | null>(null);

  const d = shortcutToDisplayString;
  const db = bindingToDisplayString;
  const fileMenuItems: MenuItem[] = [
    { label: t.new, onClick: onNew, shortcut: d(COMMON_SHORTCUTS.newFile) },
    { label: t.load, onClick: onLoad },
    { divider: true },
    { label: t.save, onClick: onSave, disabled: !canSave, shortcut: d(COMMON_SHORTCUTS.save) },
    { label: t.saveAs, onClick: onSaveAs, disabled: !canSave, shortcut: d(COMMON_SHORTCUTS.saveAs) },
    { divider: true },
    { label: `${t.export} PNG ZIP`, onClick: onExportZip, disabled: !canExport },
    { label: `${t.export} Sprite Sheet (PNG)`, onClick: onExportSpriteSheet, disabled: !canExport },
    { label: `${t.export} Sprite Sheet (WebP)`, onClick: onExportSpriteSheetWebp, disabled: !canExport },
    { divider: true },
    { label: t.importImage, onClick: onImportImage },
    { label: t.importSheet, onClick: onImportSheet },
    { label: t.importVideo, onClick: onImportVideo },
  ];

  const editMenuItems: MenuItem[] = [
    { label: t.undo, onClick: onUndo, disabled: !canUndo, shortcut: d(COMMON_SHORTCUTS.undo) },
    { label: t.redo, onClick: onRedo, disabled: !canRedo, shortcut: db(COMMON_SHORTCUTS.redo) },
  ];

  const windowMenuItems: MenuItem[] = [
    { label: t.preview, onClick: onTogglePreview, checked: isPreviewOpen },
    { label: t.frameEdit, onClick: onToggleFrameEdit, checked: isFrameEditOpen },
    { divider: true },
    { label: t.resetLayout, onClick: onResetLayout },
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
        label={t.window}
        items={windowMenuItems}
        isOpen={openMenu === "window"}
        onOpenChange={(open) => setOpenMenu(open ? "window" : null)}
      />
    </div>
  );
}
