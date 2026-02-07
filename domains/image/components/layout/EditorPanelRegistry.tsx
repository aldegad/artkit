"use client";

import { createPanelRegistry } from "@/shared/components/layout";

const PANEL_META = {
  canvas: {
    title: "Canvas",
    showHeader: false,
    defaultSize: { width: 800, height: 600 },
    minSize: 300,
  },
  layers: {
    title: "Layers",
    showHeader: true,
    defaultSize: { width: 280, height: 400 },
    minSize: 200,
  },
  tools: {
    title: "Tool Options",
    showHeader: true,
    defaultSize: { width: 250, height: 300 },
    minSize: 150,
  },
} as const;

const registry = createPanelRegistry(PANEL_META);

export const {
  registerPanelComponent: registerEditorPanelComponent,
  clearPanelComponents: clearEditorPanelComponents,
  getPanelContent: getEditorPanelContent,
  getPanelTitle: getEditorPanelTitle,
  isPanelHeaderVisible: isEditorPanelHeaderVisible,
  getPanelDefaultSize: getEditorPanelDefaultSize,
  getPanelMinSize: getEditorPanelMinSize,
  getRegisteredPanelIds: getRegisteredEditorPanelIds,
  usePanelUpdate,
  subscribeToPanelUpdates,
} = registry;
