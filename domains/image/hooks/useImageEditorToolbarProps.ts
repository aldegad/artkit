"use client";

import { useMemo } from "react";
import { EditorActionToolbarProps } from "../components/toolbars/EditorActionToolbar";
import { EditorToolOptionsBarProps } from "../components/toolbars/EditorToolOptionsBar";
import {
  createEditorToolButtons,
  EditorToolButtonTranslations,
} from "../constants";
import { MarqueeSubTool } from "../types";
import { useEditorToolbarModels } from "./useEditorToolbarModels";

interface UseImageEditorToolbarPropsOptions {
  hasLayers: boolean;
  marqueeSubTool: MarqueeSubTool;
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
    marqueeSubTool,
    toolButtonTranslations,
    actionToolbarConfig,
    actionToolbarTranslations,
    toolOptionsConfig,
    toolOptionsTranslations,
  } = options;

  const toolButtons = useMemo(
    () => createEditorToolButtons(toolButtonTranslations, { marqueeSubTool }),
    [toolButtonTranslations, marqueeSubTool]
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
