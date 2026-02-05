"use client";

import { ReactNode, useState, useEffect } from "react";
import { PanelMeta } from "./types";

// ============================================
// Panel Registry Factory
// ============================================

export function createPanelRegistry(defaultMeta: Record<string, PanelMeta>) {
  // Panel component registry
  let panelComponents: Record<string, () => ReactNode> = {};

  // Listeners for panel updates
  const updateListeners: Set<() => void> = new Set();

  // Subscribe to panel updates
  function subscribeToPanelUpdates(listener: () => void): () => void {
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
  function usePanelUpdate() {
    const [, setVersion] = useState(0);

    useEffect(() => {
      return subscribeToPanelUpdates(() => setVersion((v) => v + 1));
    }, []);
  }

  // Register a panel component
  function registerPanelComponent(panelId: string, component: () => ReactNode) {
    panelComponents[panelId] = component;
    notifyPanelUpdate();
  }

  // Clear all registered components
  function clearPanelComponents() {
    panelComponents = {};
  }

  // Get panel content
  function getPanelContent(panelId: string): ReactNode {
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
  function getPanelTitle(panelId: string): string {
    return defaultMeta[panelId]?.title || panelId;
  }

  // Check if panel should show header
  function isPanelHeaderVisible(panelId: string): boolean {
    return defaultMeta[panelId]?.showHeader ?? true;
  }

  // Get panel default size
  function getPanelDefaultSize(panelId: string): { width: number; height: number } {
    return defaultMeta[panelId]?.defaultSize || { width: 400, height: 300 };
  }

  // Get panel minimum size
  function getPanelMinSize(panelId: string): number {
    return defaultMeta[panelId]?.minSize || 100;
  }

  // Get all registered panel IDs
  function getRegisteredPanelIds(): string[] {
    return Object.keys(panelComponents);
  }

  return {
    registerPanelComponent,
    clearPanelComponents,
    getPanelContent,
    getPanelTitle,
    isPanelHeaderVisible,
    getPanelDefaultSize,
    getPanelMinSize,
    getRegisteredPanelIds,
    usePanelUpdate,
    subscribeToPanelUpdates,
  };
}
