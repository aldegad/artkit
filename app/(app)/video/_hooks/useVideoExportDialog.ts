"use client";

import { useCallback, useState } from "react";

export function useVideoExportDialog() {
  const [showExportModal, setShowExportModal] = useState(false);

  const handleExportSettled = useCallback((result: { ok: boolean }) => {
    if (result.ok) {
      setShowExportModal(false);
    }
  }, []);

  return {
    showExportModal,
    setShowExportModal,
    handleExportSettled,
  };
}
