"use client";

import { PanelNode, SplitNode } from "@/shared/types/layout";
import { createLayoutContext } from "@/shared/components/layout";
import {
  getPanelContent,
  getPanelTitle,
  isPanelHeaderVisible,
  getPanelDefaultSize,
  subscribeToPanelUpdates,
} from "../components/layout";

// ============================================
// Default Layout for Sound Editor
// ============================================

const SOUND_DEFAULT_LAYOUT: SplitNode = {
  type: "split",
  id: "root",
  direction: "vertical",
  children: [
    { type: "panel", id: "waveform-panel", panelId: "waveform", minSize: 200 } as PanelNode,
    {
      type: "split",
      id: "bottom-split",
      direction: "horizontal",
      children: [
        { type: "panel", id: "trim-panel", panelId: "trim", minSize: 150 } as PanelNode,
        { type: "panel", id: "format-panel", panelId: "format", minSize: 150 } as PanelNode,
      ],
      sizes: [50, 50],
    } as SplitNode,
  ],
  sizes: [68, 32],
};

// ============================================
// Create Layout Context using Factory
// ============================================

const { Provider, useLayoutContext } = createLayoutContext({
  storageKey: "sound-editor-layout",
  defaultLayout: SOUND_DEFAULT_LAYOUT,
  getPanelContent,
  getPanelTitle,
  isPanelHeaderVisible,
  getPanelDefaultSize,
  defaultFloatingWindowSize: { width: 400, height: 300 },
  containerClassName: "h-full w-full",
  subscribeToPanelUpdates,
});

// ============================================
// Exports
// ============================================

export const SoundLayoutProvider = Provider;
export const useSoundLayout = useLayoutContext;
