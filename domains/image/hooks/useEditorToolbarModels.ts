"use client";

import { useMemo } from "react";
import { EditorActionToolbarProps } from "../components/toolbars/EditorActionToolbar";
import { EditorToolOptionsBarProps } from "../components/toolbars/EditorToolOptionsBar";

interface UseEditorToolbarModelsOptions {
  hasLayers: boolean;
  actionToolbarProps: EditorActionToolbarProps;
  toolOptionsBarProps: EditorToolOptionsBarProps;
}

interface UseEditorToolbarModelsReturn {
  showToolbars: boolean;
  showPanModeToggle: boolean;
  actionToolbarProps: EditorActionToolbarProps;
  toolOptionsBarProps: EditorToolOptionsBarProps;
}

export function useEditorToolbarModels(
  options: UseEditorToolbarModelsOptions
): UseEditorToolbarModelsReturn {
  const { hasLayers, actionToolbarProps, toolOptionsBarProps } = options;

  return useMemo(
    () => ({
      showToolbars: hasLayers,
      showPanModeToggle: hasLayers,
      actionToolbarProps,
      toolOptionsBarProps,
    }),
    [hasLayers, actionToolbarProps, toolOptionsBarProps]
  );
}
