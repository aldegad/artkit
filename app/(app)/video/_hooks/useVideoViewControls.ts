"use client";

import { useCallback } from "react";
import { TIMELINE } from "@/domains/video";
import type { LayoutNode } from "@/shared/types/layout";
import { isPanelNode, isSplitNode } from "@/shared/types/layout";

interface VideoFloatingWindowState {
  id: string;
  panelId: string;
}

interface VideoLayoutState {
  root: LayoutNode;
  floatingWindows: VideoFloatingWindowState[];
}

interface UseVideoViewControlsOptions {
  timelineZoom: number;
  projectDuration: number;
  setZoom: (zoom: number) => void;
  setScrollX: (scrollX: number) => void;
  layoutState: VideoLayoutState;
  closeFloatingWindow: (windowId: string) => void;
  removePanel: (nodeId: string) => void;
  addPanel: (targetPanelId: string, panelId: string, direction: "left" | "right" | "top" | "bottom") => void;
  openFloatingWindow: (panelId: string, position?: { x: number; y: number }) => void;
}

function findPanelNodeIdByPanelId(node: LayoutNode, panelId: string): string | null {
  if (isPanelNode(node) && node.panelId === panelId) {
    return node.id;
  }

  if (isSplitNode(node)) {
    for (const child of node.children) {
      const found = findPanelNodeIdByPanelId(child, panelId);
      if (found) return found;
    }
  }

  return null;
}

export function useVideoViewControls(options: UseVideoViewControlsOptions) {
  const {
    timelineZoom,
    projectDuration,
    setZoom,
    setScrollX,
    layoutState,
    closeFloatingWindow,
    removePanel,
    addPanel,
    openFloatingWindow,
  } = options;

  const handleZoomIn = useCallback(() => {
    setZoom(timelineZoom * 1.25);
  }, [setZoom, timelineZoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(timelineZoom / 1.25);
  }, [setZoom, timelineZoom]);

  const handleFitToScreen = useCallback(() => {
    const timelineRoot = document.querySelector("[data-video-timeline-root]") as HTMLDivElement | null;
    const width = timelineRoot?.clientWidth;
    if (!width) {
      setZoom(TIMELINE.DEFAULT_ZOOM);
      setScrollX(0);
      return;
    }

    const availableWidth = Math.max(100, width - 160);
    const duration = Math.max(projectDuration, 1);
    setZoom(availableWidth / duration);
    setScrollX(0);
  }, [projectDuration, setZoom, setScrollX]);

  const handleToggleTimeline = useCallback(() => {
    const timelineWindow = layoutState.floatingWindows.find((window) => window.panelId === "timeline");
    if (timelineWindow) {
      closeFloatingWindow(timelineWindow.id);
      return;
    }

    const timelinePanelNodeId = findPanelNodeIdByPanelId(layoutState.root, "timeline");
    if (timelinePanelNodeId) {
      removePanel(timelinePanelNodeId);
      return;
    }

    const previewPanelNodeId = findPanelNodeIdByPanelId(layoutState.root, "preview");
    if (previewPanelNodeId) {
      addPanel(previewPanelNodeId, "timeline", "bottom");
      return;
    }

    openFloatingWindow("timeline", { x: 140, y: 140 });
  }, [layoutState, closeFloatingWindow, removePanel, addPanel, openFloatingWindow]);

  return {
    handleZoomIn,
    handleZoomOut,
    handleFitToScreen,
    handleToggleTimeline,
  };
}
