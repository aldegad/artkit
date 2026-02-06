"use client";

import { useState } from "react";
import {
  MenuDropdown,
  SpinnerIcon,
  type MenuItem,
} from "../../../shared/components";

// ============================================
// Types
// ============================================

interface SpriteMenuBarProps {
  onNew: () => void;
  onLoad: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onImportImage: () => void;
  onImportSheet: () => void;
  onImportVideo: () => void;
  onTogglePreview: () => void;
  onToggleFrameEdit: () => void;
  onResetLayout: () => void;
  isPreviewOpen: boolean;
  isFrameEditOpen: boolean;
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
    importSheet: string;
    importVideo: string;
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
  onImportImage,
  onImportSheet,
  onImportVideo,
  onTogglePreview,
  onToggleFrameEdit,
  onResetLayout,
  isPreviewOpen,
  isFrameEditOpen,
  canSave,
  isLoading,
  translations: t,
}: SpriteMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"file" | "window" | null>(null);

  const fileMenuItems: MenuItem[] = [
    { label: t.new, onClick: onNew, shortcut: "⌘N" },
    { label: t.load, onClick: onLoad },
    { divider: true },
    { label: t.save, onClick: onSave, disabled: !canSave, shortcut: "⌘S" },
    { label: t.saveAs, onClick: onSaveAs, disabled: !canSave, shortcut: "⇧⌘S" },
    { divider: true },
    { label: t.importImage, onClick: onImportImage },
    { label: t.importSheet, onClick: onImportSheet },
    { label: t.importVideo, onClick: onImportVideo },
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
        label={t.window}
        items={windowMenuItems}
        isOpen={openMenu === "window"}
        onOpenChange={(open) => setOpenMenu(open ? "window" : null)}
      />
    </div>
  );
}
