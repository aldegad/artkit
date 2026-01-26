"use client";

import { useLayout } from "../../contexts/LayoutContext";
import { useLanguage } from "../../contexts/LanguageContext";

// ============================================
// Types
// ============================================

type DockPosition = "left" | "right" | "top" | "bottom";

// ============================================
// Component
// ============================================

export default function DockZoneOverlay() {
  const { layoutState } = useLayout();
  const { t } = useLanguage();

  // Only show when dragging a floating window
  if (!layoutState.isDragging || !layoutState.draggedWindowId) return null;

  const activePosition = layoutState.dropTarget?.position;

  const zones: { position: DockPosition; className: string; label: string }[] = [
    {
      position: "left",
      className: "left-0 top-0 w-16 h-full",
      label: t.dockLeft,
    },
    {
      position: "right",
      className: "right-0 top-0 w-16 h-full",
      label: t.dockRight,
    },
    {
      position: "top",
      className: "left-0 top-0 w-full h-16",
      label: t.dockTop,
    },
    {
      position: "bottom",
      className: "left-0 bottom-0 w-full h-16",
      label: t.dockBottom,
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
