"use client";

import { useMemo } from "react";
import { EditorActionToolbarProps } from "../components/toolbars/EditorActionToolbar";
import { EditorToolOptionsBarProps } from "../components/toolbars/EditorToolOptionsBar";
import {
  createEditorToolButtons,
  EditorToolButtonTranslations,
} from "../constants";
import { useEditorToolbarModels } from "./useEditorToolbarModels";

interface UseImageEditorToolbarPropsOptions {
  hasLayers: boolean;
  toolButtonTranslations: EditorToolButtonTranslations;
  actionToolbarConfig: Omit<EditorActionToolbarProps, "toolButtons" | "translations">;
  actionToolbarTranslations: EditorActionToolbarProps["translations"];
  toolOptionsConfig: Omit<EditorToolOptionsBarProps, "currentToolName" | "translations">;
  toolOptionsTranslations: EditorToolOptionsBarProps["translations"];
}

export function useImageEditorToolbarProps(
  options: UseImageEditorToolbarPropsOptions
) {
  const {
    hasLayers,
    toolButtonTranslations,
    actionToolbarConfig,
    actionToolbarTranslations,
    toolOptionsConfig,
    toolOptionsTranslations,
  } = options;

  const toolButtons = useMemo(
    () => createEditorToolButtons(toolButtonTranslations),
    [toolButtonTranslations]
  );

  const actionToolbarProps: EditorActionToolbarProps = {
    ...actionToolbarConfig,
    toolButtons,
    translations: actionToolbarTranslations,
  };

  const toolOptionsBarProps: EditorToolOptionsBarProps = {
    ...toolOptionsConfig,
    currentToolName: toolButtons.find((toolButton) => toolButton.mode === toolOptionsConfig.toolMode)?.name,
    translations: toolOptionsTranslations,
  };

  return useEditorToolbarModels({
    hasLayers,
    actionToolbarProps,
    toolOptionsBarProps,
  });
}
