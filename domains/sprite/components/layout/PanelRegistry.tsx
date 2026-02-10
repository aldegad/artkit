"use client";

import { createPanelRegistry } from "@/shared/components/layout";
import SpriteCanvas from "../SpriteCanvas";
import TimelineContent from "../TimelineContent";
import AnimationPreview from "../AnimationPreview";
import FramePreview from "../FramePreview";
import FrameStrip from "../FrameStrip";

// ============================================
// Panel Metadata
// ============================================

const PANEL_META = {
  canvas: {
    title: "Canvas",
    showHeader: true,
    defaultSize: { width: 800, height: 600 },
    minSize: 150,
  },
  timeline: {
    title: "Timeline",
    showHeader: true,
    defaultSize: { width: 800, height: 200 },
    minSize: 100,
  },
  preview: {
    title: "Animation Preview",
    showHeader: false,
    defaultSize: { width: 400, height: 450 },
    minSize: 200,
  },
  "frame-edit": {
    title: "Frame Edit",
    showHeader: true,
    defaultSize: { width: 450, height: 480 },
    minSize: 200,
  },
  frames: {
    title: "Frames",
    showHeader: true,
    defaultSize: { width: 400, height: 200 },
    minSize: 100,
  },
} as const;

const registry = createPanelRegistry(PANEL_META);

registry.registerPanelComponent("canvas", () => <SpriteCanvas />);
registry.registerPanelComponent("timeline", () => <TimelineContent />);
registry.registerPanelComponent("preview", () => <AnimationPreview />);
registry.registerPanelComponent("frame-edit", () => <FramePreview />);
registry.registerPanelComponent("frames", () => <FrameStrip />);

export const {
  registerPanelComponent,
  getPanelContent,
  getPanelTitle,
  isPanelHeaderVisible,
  getPanelDefaultSize,
  getPanelMinSize,
  getRegisteredPanelIds,
  usePanelUpdate,
  subscribeToPanelUpdates,
} = registry;
