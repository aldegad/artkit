"use client";

import { useLanguage } from "../../shared/contexts";

// ============================================
// Placeholder - Composition layers removed
// ============================================

export default function LayersPanelContent() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-text-tertiary text-sm text-center">
          {t.noLayersYet || "No layers available"}
        </p>
      </div>
    </div>
  );
}
