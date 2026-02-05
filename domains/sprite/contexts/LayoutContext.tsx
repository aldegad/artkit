"use client";

import { DEFAULT_LAYOUT } from "../types";
import { createLayoutContext } from "@/shared/components/layout";
import {
  getPanelContent,
  getPanelTitle,
  isPanelHeaderVisible,
  getPanelDefaultSize,
} from "../components/layout/PanelRegistry";

// ============================================
// Create Layout Context using Factory
// ============================================

const { Provider, useLayoutContext } = createLayoutContext({
  storageKey: "sprite-editor-layout",
  defaultLayout: DEFAULT_LAYOUT,
  getPanelContent,
  getPanelTitle,
  isPanelHeaderVisible,
  getPanelDefaultSize,
  defaultFloatingWindowSize: { width: 400, height: 450 },
  containerClassName: "h-full w-full",
});

// ============================================
// Exports
// ============================================

export const LayoutProvider = Provider;
export const useLayout = useLayoutContext;
