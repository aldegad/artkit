"use client";

import { ReactNode, useState, useEffect } from "react";

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
};

// ============================================
// Registry Functions
// ============================================

// Panel component registry - will be set dynamically from page
let panelComponents: Record<string, () => ReactNode> = {};

// Listeners for panel updates
const updateListeners: Set<() => void> = new Set();

// Subscribe to panel updates
export function subscribeToPanelUpdates(listener: () => void): () => void {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}

// Notify all listeners of panel update
function notifyPanelUpdate() {
  updateListeners.forEach((listener) => listener());
}

// Hook to force re-render when panels update
export function usePanelUpdate() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return subscribeToPanelUpdates(() => setVersion((v) => v + 1));
  }, []);
}

// Register a panel component
export function registerEditorPanelComponent(panelId: string, component: () => ReactNode) {
  panelComponents[panelId] = component;
  notifyPanelUpdate();
}

// Clear all registered components
export function clearEditorPanelComponents() {
  panelComponents = {};
}

// Get panel content
export function getEditorPanelContent(panelId: string): ReactNode {
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
export function getEditorPanelTitle(panelId: string): string {
  return PANEL_META[panelId]?.title || panelId;
}

// Check if panel should show header
export function isEditorPanelHeaderVisible(panelId: string): boolean {
  return PANEL_META[panelId]?.showHeader ?? true;
}

// Get panel default size
export function getEditorPanelDefaultSize(panelId: string): {
  width: number;
  height: number;
} {
  return PANEL_META[panelId]?.defaultSize || { width: 400, height: 300 };
}

// Get panel minimum size
export function getEditorPanelMinSize(panelId: string): number {
  return PANEL_META[panelId]?.minSize || 100;
}

// Get all registered panel IDs
export function getRegisteredEditorPanelIds(): string[] {
  return Object.keys(panelComponents);
}
