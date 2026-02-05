"use client";

import { useLayout } from "./LayoutConfigContext";
import SplitContainer from "./SplitContainer";
import FloatingWindows from "./FloatingWindows";

// ============================================
// Component
// ============================================

export default function SplitView() {
  const { layoutState } = useLayout();

  return (
    <>
      <SplitContainer node={layoutState.root} />
      <FloatingWindows />
    </>
  );
}
