"use client";

import { useCallback, useState, type RefObject } from "react";
import type { ImageExportMode } from "./useImageExport";

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
  exportMode: ImageExportMode;
  setExportMode: (mode: ImageExportMode) => void;
  openProjectList: () => void;
  openExport: () => void;
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
  const [exportMode, setExportMode] = useState<ImageExportMode>("single");

  const openProjectList = useCallback(() => {
    setIsProjectListOpen(true);
  }, [setIsProjectListOpen]);

  const openExport = useCallback(() => {
    setExportMode("single");
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
    setExportMode,
    openProjectList,
    openExport,
    openImportImage,
    openBackgroundRemovalConfirm,
    togglePanLock,
  };
}
