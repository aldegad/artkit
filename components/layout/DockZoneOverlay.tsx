"use client";

import { useLayout } from "../../contexts/LayoutContext";

// ============================================
// Types
// ============================================

type DockPosition = "left" | "right" | "top" | "bottom";

// ============================================
// Component
// ============================================

export default function DockZoneOverlay() {
  const { layoutState } = useLayout();

  // Only show when dragging a floating window
  if (!layoutState.isDragging || !layoutState.draggedWindowId) return null;

  const activePosition = layoutState.dropTarget?.position;

  const zones: { position: DockPosition; className: string; label: string }[] = [
    {
      position: "left",
      className: "left-0 top-0 w-16 h-full",
      label: "◀ 왼쪽",
    },
    {
      position: "right",
      className: "right-0 top-0 w-16 h-full",
      label: "오른쪽 ▶",
    },
    {
      position: "top",
      className: "left-0 top-0 w-full h-16",
      label: "▲ 위",
    },
    {
      position: "bottom",
      className: "left-0 bottom-0 w-full h-16",
      label: "▼ 아래",
    },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none z-40">
      {zones.map(({ position, className, label }) => (
        <div
          key={position}
          className={`
            absolute ${className}
            flex items-center justify-center
            transition-all duration-200
            ${
              activePosition === position
                ? "bg-accent-primary/40 border-2 border-accent-primary"
                : "bg-surface-tertiary/30"
            }
          `}
        >
          {activePosition === position && (
            <span className="text-white text-sm font-medium bg-accent-primary px-3 py-1 rounded shadow-lg">
              {label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
