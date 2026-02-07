"use client";

import { SplitNode, PanelNode } from "@/types/layout";
import { createLayoutContext } from "@/shared/components/layout";
import {
  getEditorPanelContent,
  getEditorPanelTitle,
  isEditorPanelHeaderVisible,
  getEditorPanelDefaultSize,
  subscribeToPanelUpdates,
} from "../components/layout/EditorPanelRegistry";

// ============================================
// Default Layout for Image Editor
// ============================================

const EDITOR_DEFAULT_LAYOUT: SplitNode = {
  type: "split",
  id: "root",
  direction: "horizontal",
  children: [
    { type: "panel", id: "canvas-panel", panelId: "canvas", minSize: 300 } as PanelNode,
    { type: "panel", id: "layers-panel", panelId: "layers", minSize: 200 } as PanelNode,
  ],
  sizes: [75, 25],
};

// ============================================
// Create Layout Context using Factory
// ============================================

const { Provider, useLayoutContext } = createLayoutContext({
  storageKey: "image-editor-layout",
  defaultLayout: EDITOR_DEFAULT_LAYOUT,
  getPanelContent: getEditorPanelContent,
  getPanelTitle: getEditorPanelTitle,
  isPanelHeaderVisible: isEditorPanelHeaderVisible,
  getPanelDefaultSize: getEditorPanelDefaultSize,
  defaultFloatingWindowSize: { width: 300, height: 400 },
  containerClassName: "contents", // Use 'contents' to not affect layout
  subscribeToPanelUpdates: subscribeToPanelUpdates,
});

// ============================================
// Exports
// ============================================

export const EditorLayoutProvider = Provider;
export const useEditorLayout = useLayoutContext;
