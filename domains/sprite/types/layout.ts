import { SplitNode, PanelNode } from "@/shared/types/layout";

// ============================================
// Default Layouts
// ============================================

export const DEFAULT_LAYOUT: SplitNode = {
  type: "split",
  id: "root",
  direction: "vertical",
  children: [
    { type: "panel", id: "preview-panel", panelId: "preview", minSize: 200 } as PanelNode,
    {
      type: "split",
      id: "bottom-row",
      direction: "horizontal",
      children: [
        { type: "panel", id: "timeline-panel", panelId: "timeline", minSize: 100 } as PanelNode,
        { type: "panel", id: "frames-panel", panelId: "frames", minSize: 100 } as PanelNode,
      ],
      sizes: [65, 35],
    } as SplitNode,
  ],
  sizes: [50, 50],
};
