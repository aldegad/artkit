"use client";

import { useCallback, useState, type RefObject } from "react";

interface UseImageEditorUiActionsOptions {
  fileInputRef: RefObject<HTMLInputElement | null>;
  setIsProjectListOpen: (open: boolean) => void;
  setShowBgRemovalConfirm: (show: boolean) => void;
  isPanLocked: boolean;
  setIsPanLocked: (locked: boolean) => void;
}

interface UseImageEditorUiActionsReturn {
  showExportModal: boolean;
  setShowExportModal: (show: boolean) => void;
  exportMode: "single" | "layers";
  openProjectList: () => void;
  openExportSingle: () => void;
  openExportLayers: () => void;
  openImportImage: () => void;
  openBackgroundRemovalConfirm: () => void;
  togglePanLock: () => void;
}

export function useImageEditorUiActions(
  options: UseImageEditorUiActionsOptions
): UseImageEditorUiActionsReturn {
  const {
    fileInputRef,
    setIsProjectListOpen,
    setShowBgRemovalConfirm,
    isPanLocked,
    setIsPanLocked,
  } = options;

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMode, setExportMode] = useState<"single" | "layers">("single");

  const openProjectList = useCallback(() => {
    setIsProjectListOpen(true);
  }, [setIsProjectListOpen]);

  const openExportSingle = useCallback(() => {
    setExportMode("single");
    setShowExportModal(true);
  }, []);

  const openExportLayers = useCallback(() => {
    setExportMode("layers");
    setShowExportModal(true);
  }, []);

  const openImportImage = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  const openBackgroundRemovalConfirm = useCallback(() => {
    setShowBgRemovalConfirm(true);
  }, [setShowBgRemovalConfirm]);

  const togglePanLock = useCallback(() => {
    setIsPanLocked(!isPanLocked);
  }, [isPanLocked, setIsPanLocked]);

  return {
    showExportModal,
    setShowExportModal,
    exportMode,
    openProjectList,
    openExportSingle,
    openExportLayers,
    openImportImage,
    openBackgroundRemovalConfirm,
    togglePanLock,
  };
}
