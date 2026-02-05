"use client";

import { RULER_THICKNESS } from "../../utils/rulerUtils";

// ============================================
// RulerCorner Component
// Small corner box where rulers meet
// ============================================

export function RulerCorner() {
  return (
    <div
      className="absolute top-0 left-0 bg-surface-tertiary border-r border-b border-border-default"
      style={{
        width: RULER_THICKNESS,
        height: RULER_THICKNESS,
      }}
    />
  );
}
