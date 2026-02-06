import { ReactNode, RefObject } from "react";
import { SplitNode, LayoutState, DropTarget, ResizeState, PanelNode, SnapInfo } from "@/types/layout";

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

  // Panel update subscription (for re-rendering when panel content changes)
  subscribeToPanelUpdates?: (listener: () => void) => () => void;
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
  updateResizeAbsolute: (totalDelta: number) => void;
  endResize: () => void;
  resizeState: ResizeState | null;
  getNode: (nodeId: string) => SplitNode | PanelNode | null;
  isPanelOpen: (panelId: string) => boolean;
  // Panel ref registry for snap functionality
  registerPanelRef: (panelId: string, ref: RefObject<HTMLDivElement | null>) => void;
  unregisterPanelRef: (panelId: string) => void;
  getPanelRect: (panelId: string) => DOMRect | null;
  getAllPanelRects: () => Map<string, DOMRect>;
  // Snap info update
  updateFloatingWindowSnap: (windowId: string, snapInfo: SnapInfo | undefined) => void;
  updateFloatingWindowMinimizedPosition: (windowId: string, position: { x: number; y: number } | undefined) => void;
  // Reset layout
  resetLayout: () => void;
}
