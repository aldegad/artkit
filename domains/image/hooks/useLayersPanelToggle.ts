"use client";

import { useCallback } from "react";
import { isSplitNode, type PanelNode, type SplitNode } from "@/shared/types/layout";

interface FloatingWindowLike {
  id: string;
  panelId: string;
}

interface UseLayersPanelToggleOptions {
  isLayersOpen: boolean;
  floatingWindows: FloatingWindowLike[];
  root: SplitNode | PanelNode;
  closeFloatingWindow: (windowId: string) => void;
  removePanel: (nodeId: string) => void;
  openFloatingWindow: (panelId: string) => void;
}

interface UseLayersPanelToggleReturn {
  handleToggleLayers: () => void;
}

function findPanelNodeId(node: SplitNode | PanelNode, panelId: string): string | null {
  if (!isSplitNode(node)) {
    return node.panelId === panelId ? node.id : null;
  }

  for (const child of node.children) {
    const foundId = findPanelNodeId(child as SplitNode | PanelNode, panelId);
    if (foundId) return foundId;
  }

  return null;
}

export function useLayersPanelToggle(
  options: UseLayersPanelToggleOptions
): UseLayersPanelToggleReturn {
  const {
    isLayersOpen,
    floatingWindows,
    root,
    closeFloatingWindow,
    removePanel,
    openFloatingWindow,
  } = options;

  const handleToggleLayers = useCallback(() => {
    if (!isLayersOpen) {
      openFloatingWindow("layers");
      return;
    }

    const floatingWindow = floatingWindows.find((window) => window.panelId === "layers");
    if (floatingWindow) {
      closeFloatingWindow(floatingWindow.id);
      return;
    }

    const panelNodeId = findPanelNodeId(root, "layers");
    if (panelNodeId) {
      removePanel(panelNodeId);
    }
  }, [
    isLayersOpen,
    floatingWindows,
    root,
    closeFloatingWindow,
    removePanel,
    openFloatingWindow,
  ]);

  return {
    handleToggleLayers,
  };
}
