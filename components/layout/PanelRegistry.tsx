"use client";

import { ReactNode } from "react";
import { CanvasContent, TimelineContent } from "../panels";
import AnimationPreviewContent from "../panels/AnimationPreviewContent";
import FramePreviewContent from "../panels/FramePreviewContent";

// ============================================
// Panel Metadata
// ============================================

interface PanelMeta {
  title: string;
  showHeader: boolean;
  defaultSize: { width: number; height: number };
  minSize: number;
}

const PANEL_META: Record<string, PanelMeta> = {
  canvas: {
    title: "Canvas",
    showHeader: false,
    defaultSize: { width: 800, height: 600 },
    minSize: 150,
  },
  timeline: {
    title: "Timeline",
    showHeader: false,
    defaultSize: { width: 800, height: 200 },
    minSize: 100,
  },
  preview: {
    title: "Animation Preview",
    showHeader: true,
    defaultSize: { width: 400, height: 450 },
    minSize: 200,
  },
  "frame-edit": {
    title: "Frame Edit",
    showHeader: true,
    defaultSize: { width: 450, height: 480 },
    minSize: 200,
  },
};

// ============================================
// Registry Functions
// ============================================

// Panel component registry
let panelComponents: Record<string, () => ReactNode> = {
  canvas: () => <CanvasContent />,
  timeline: () => <TimelineContent />,
  preview: () => <AnimationPreviewContent />,
  "frame-edit": () => <FramePreviewContent />,
};

// Register a panel component
export function registerPanelComponent(panelId: string, component: () => ReactNode) {
  panelComponents[panelId] = component;
}

// Get panel content
export function getPanelContent(panelId: string): ReactNode {
  const renderFn = panelComponents[panelId];
  if (!renderFn) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        Unknown Panel: {panelId}
      </div>
    );
  }
  return renderFn();
}

// Get panel title
export function getPanelTitle(panelId: string): string {
  return PANEL_META[panelId]?.title || panelId;
}

// Check if panel should show header
export function isPanelHeaderVisible(panelId: string): boolean {
  return PANEL_META[panelId]?.showHeader ?? true;
}

// Get panel default size
export function getPanelDefaultSize(panelId: string): {
  width: number;
  height: number;
} {
  return PANEL_META[panelId]?.defaultSize || { width: 400, height: 300 };
}

// Get panel minimum size
export function getPanelMinSize(panelId: string): number {
  return PANEL_META[panelId]?.minSize || 100;
}

// Get all registered panel IDs
export function getRegisteredPanelIds(): string[] {
  return Object.keys(panelComponents);
}
