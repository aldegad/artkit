"use client";

import { useCallback, useMemo } from "react";
import { EditorHeaderProps } from "../components/EditorHeader";

interface UseEditorHeaderModelOptions {
  title: string;
  layersCount: number;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  projectNamePlaceholder: string;
  onNew: () => void;
  onLoad: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onImportImage: () => void;
  onExport: () => void;
  onExportLayers: () => void;
  onToggleLayers: () => void;
  isLayersOpen: boolean;
  canSave: boolean;
  hasSelectedLayers: boolean;
  isLoading: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  showRulers: boolean;
  showGuides: boolean;
  lockGuides: boolean;
  snapToGuides: boolean;
  setShowRulers: (show: boolean) => void;
  setShowGuides: (show: boolean) => void;
  setLockGuides: (lock: boolean) => void;
  setSnapToGuides: (snap: boolean) => void;
  onClearGuides: () => void;
  panelHeadersVisible: boolean;
  onTogglePanelHeaders: () => void;
  translations: EditorHeaderProps["translations"];
}

export function useEditorHeaderModel(
  options: UseEditorHeaderModelOptions
): EditorHeaderProps {
  const {
    title,
    layersCount,
    projectName,
    onProjectNameChange,
    projectNamePlaceholder,
    onNew,
    onLoad,
    onSave,
    onSaveAs,
    onImportImage,
    onExport,
    onExportLayers,
    onToggleLayers,
    isLayersOpen,
    canSave,
    hasSelectedLayers,
    isLoading,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    showRulers,
    showGuides,
    lockGuides,
    snapToGuides,
    setShowRulers,
    setShowGuides,
    setLockGuides,
    setSnapToGuides,
    onClearGuides,
    panelHeadersVisible,
    onTogglePanelHeaders,
    translations,
  } = options;

  const onToggleRulers = useCallback(() => {
    setShowRulers(!showRulers);
  }, [showRulers, setShowRulers]);

  const onToggleGuides = useCallback(() => {
    setShowGuides(!showGuides);
  }, [showGuides, setShowGuides]);

  const onToggleLockGuides = useCallback(() => {
    setLockGuides(!lockGuides);
  }, [lockGuides, setLockGuides]);

  const onToggleSnapToGuides = useCallback(() => {
    setSnapToGuides(!snapToGuides);
  }, [snapToGuides, setSnapToGuides]);

  return useMemo(
    () => ({
      title,
      layersCount,
      projectName,
      onProjectNameChange,
      projectNamePlaceholder,
      onNew,
      onLoad,
      onSave,
      onSaveAs,
      onImportImage,
      onExport,
      onExportLayers,
      onToggleLayers,
      isLayersOpen,
      canSave,
      hasSelectedLayers,
      isLoading,
      onUndo,
      onRedo,
      canUndo,
      canRedo,
      showRulers,
      showGuides,
      lockGuides,
      snapToGuides,
      onToggleRulers,
      onToggleGuides,
      onToggleLockGuides,
      onToggleSnapToGuides,
      onClearGuides,
      panelHeadersVisible,
      onTogglePanelHeaders,
      translations,
    }),
    [
      title,
      layersCount,
      projectName,
      onProjectNameChange,
      projectNamePlaceholder,
      onNew,
      onLoad,
      onSave,
      onSaveAs,
      onImportImage,
      onExport,
      onExportLayers,
      onToggleLayers,
      isLayersOpen,
      canSave,
      hasSelectedLayers,
      isLoading,
      onUndo,
      onRedo,
      canUndo,
      canRedo,
      showRulers,
      showGuides,
      lockGuides,
      snapToGuides,
      onToggleRulers,
      onToggleGuides,
      onToggleLockGuides,
      onToggleSnapToGuides,
      onClearGuides,
      panelHeadersVisible,
      onTogglePanelHeaders,
      translations,
    ]
  );
}
