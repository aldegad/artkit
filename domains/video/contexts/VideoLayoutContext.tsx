"use client";

import { PanelNode, SplitNode } from "@/types/layout";
import { createLayoutContext } from "@/shared/components/layout";
import {
  getVideoPanelContent,
  getVideoPanelTitle,
  isVideoPanelHeaderVisible,
  getVideoPanelDefaultSize,
  subscribeToVideoPanelUpdates,
} from "../components/layout";

const VIDEO_DEFAULT_LAYOUT: SplitNode = {
  type: "split",
  id: "root",
  direction: "vertical",
  children: [
    { type: "panel", id: "preview-panel", panelId: "preview", minSize: 220 } as PanelNode,
    { type: "panel", id: "timeline-panel", panelId: "timeline", minSize: 120 } as PanelNode,
  ],
  sizes: [68, 32],
};

const { Provider, useLayoutContext } = createLayoutContext({
  storageKey: "video-editor-layout",
  defaultLayout: VIDEO_DEFAULT_LAYOUT,
  getPanelContent: getVideoPanelContent,
  getPanelTitle: getVideoPanelTitle,
  isPanelHeaderVisible: isVideoPanelHeaderVisible,
  getPanelDefaultSize: getVideoPanelDefaultSize,
  defaultFloatingWindowSize: { width: 820, height: 520 },
  containerClassName: "contents",
  subscribeToPanelUpdates: subscribeToVideoPanelUpdates,
});

export const VideoLayoutProvider = Provider;
export const useVideoLayout = useLayoutContext;
