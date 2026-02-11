"use client";

import { useState } from "react";
import {
  MenuDropdown,
  type MenuItem,
} from "../../../shared/components";

// ============================================
// Types
// ============================================

interface SoundMenuBarProps {
  panelHeadersVisible: boolean;
  onTogglePanelHeaders: () => void;
  onResetLayout: () => void;
  translations: {
    view: string;
    window: string;
    panelHeaders: string;
    resetLayout: string;
  };
}

// ============================================
// Main Component
// ============================================

export default function SoundMenuBar({
  panelHeadersVisible,
  onTogglePanelHeaders,
  onResetLayout,
  translations: t,
}: SoundMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"view" | "window" | null>(null);

  const viewMenuItems: MenuItem[] = [
    { label: t.panelHeaders, onClick: onTogglePanelHeaders, checked: panelHeadersVisible },
  ];

  const windowMenuItems: MenuItem[] = [
    { label: t.resetLayout, onClick: onResetLayout },
  ];

  return (
    <div className="flex items-center gap-1">
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
