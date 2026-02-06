"use client";

import { createPanelRegistry } from "@/shared/components/layout";

const PANEL_META = {
  preview: {
    title: "Preview",
    showHeader: true,
    defaultSize: { width: 900, height: 600 },
    minSize: 240,
  },
  timeline: {
    title: "Timeline",
    showHeader: true,
    defaultSize: { width: 1000, height: 360 },
    minSize: 180,
  },
} as const;

const registry = createPanelRegistry(PANEL_META);

export const {
  registerPanelComponent: registerVideoPanelComponent,
  clearPanelComponents: clearVideoPanelComponents,
  getPanelContent: getVideoPanelContent,
  getPanelTitle: getVideoPanelTitle,
  isPanelHeaderVisible: isVideoPanelHeaderVisible,
  getPanelDefaultSize: getVideoPanelDefaultSize,
  getPanelMinSize: getVideoPanelMinSize,
  getRegisteredPanelIds: getRegisteredVideoPanelIds,
  usePanelUpdate: useVideoPanelUpdate,
  subscribeToPanelUpdates: subscribeToVideoPanelUpdates,
} = registry;
