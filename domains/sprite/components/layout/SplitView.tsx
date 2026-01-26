"use client";

import { useLayout } from "../../contexts/LayoutContext";
import SplitContainer from "./SplitContainer";
import DockZoneOverlay from "./DockZoneOverlay";
import FloatingWindows from "./FloatingWindows";

// ============================================
// Component
// ============================================

export default function SplitView() {
  const { layoutState } = useLayout();

  return (
    <div className="h-full w-full relative overflow-hidden">
      {/* Main split layout */}
      <SplitContainer node={layoutState.root} />

      {/* Dock zone overlay (shown during drag) */}
      <DockZoneOverlay />

      {/* Floating windows */}
      <FloatingWindows />
    </div>
  );
}
