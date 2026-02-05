import { ReactNode } from "react";
import { SplitNode, LayoutState, DropTarget, ResizeState, PanelNode } from "@/types/layout";

// ============================================
// Panel Metadata
// ============================================

export interface PanelMeta {
  title: string;
  showHeader: boolean;
  defaultSize: { width: number; height: number };
  minSize: number;
}

// ============================================
// Layout Configuration
// ============================================

export interface LayoutConfiguration {
  // Required
  storageKey: string;
  defaultLayout: SplitNode;

  // Panel registry functions
  getPanelContent: (panelId: string) => ReactNode;
  getPanelTitle: (panelId: string) => string;
  isPanelHeaderVisible: (panelId: string) => boolean;
  getPanelDefaultSize: (panelId: string) => { width: number; height: number };

  // Optional customizations
  defaultFloatingWindowSize?: { width: number; height: number };
  containerClassName?: string;
}

// ============================================
// Layout Context Value
// ============================================

export interface LayoutContextValue {
  layoutState: LayoutState;
  updateSizes: (splitId: string, newSizes: number[]) => void;
  addPanel: (
    targetPanelId: string,
    panelId: string,
    position: "left" | "right" | "top" | "bottom"
  ) => void;
  removePanel: (panelId: string) => void;
  openFloatingWindow: (panelId: string, position?: { x: number; y: number }) => void;
  closeFloatingWindow: (windowId: string) => void;
  updateFloatingWindowPosition: (windowId: string, position: { x: number; y: number }) => void;
  updateFloatingWindowSize: (windowId: string, size: { width: number; height: number }) => void;
  minimizeFloatingWindow: (windowId: string) => void;
  dockWindow: (
    windowId: string,
    targetPanelId: string,
    position: "left" | "right" | "top" | "bottom"
  ) => void;
  undockPanel: (panelNodeId: string) => void;
  startDragging: (windowId: string) => void;
  updateDropTarget: (target: DropTarget | null) => void;
  endDragging: () => void;
  startResize: (state: ResizeState) => void;
  updateResize: (delta: number) => void;
  endResize: () => void;
  resizeState: ResizeState | null;
  getNode: (nodeId: string) => SplitNode | PanelNode | null;
  isPanelOpen: (panelId: string) => boolean;
}
