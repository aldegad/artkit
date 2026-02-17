"use client";

import { Scrollbar } from "@/shared/components";
import { createPanelRegistry } from "@/shared/components/layout";
import { Waveform } from "../Waveform";
import { TrimControls } from "../TrimControls";
import { FormatConverter } from "../FormatConverter";
import { PlaybackControls } from "../PlaybackControls";
import { SoundToolbar } from "../SoundToolbar";

// ============================================
// Panel Metadata
// ============================================

const PANEL_META = {
  waveform: {
    title: "Waveform",
    showHeader: false,
    defaultSize: { width: 900, height: 400 },
    minSize: 200,
  },
  trim: {
    title: "Trim",
    showHeader: true,
    defaultSize: { width: 400, height: 300 },
    minSize: 150,
  },
  format: {
    title: "Export",
    showHeader: true,
    defaultSize: { width: 400, height: 300 },
    minSize: 150,
  },
} as const;

const registry = createPanelRegistry(PANEL_META);

registry.registerPanelComponent("waveform", () => (
  <div className="flex flex-col h-full overflow-hidden">
    <div className="px-4 py-2 bg-surface-secondary border-b border-border-default shrink-0">
      <SoundToolbar />
    </div>
    <div className="flex-1 min-h-0 bg-gray-900">
      <Waveform className="w-full h-full" />
    </div>
    <div className="flex items-center justify-center py-2 shrink-0">
      <PlaybackControls />
    </div>
  </div>
));

registry.registerPanelComponent("trim", () => (
  <Scrollbar className="h-full p-4" overflow={{ x: "hidden", y: "scroll" }}>
    <TrimControls />
  </Scrollbar>
));

registry.registerPanelComponent("format", () => (
  <Scrollbar className="h-full p-4" overflow={{ x: "hidden", y: "scroll" }}>
    <FormatConverter />
  </Scrollbar>
));

export const {
  getPanelContent,
  getPanelTitle,
  isPanelHeaderVisible,
  getPanelDefaultSize,
  subscribeToPanelUpdates,
} = registry;
