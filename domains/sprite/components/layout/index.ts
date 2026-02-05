// ============================================
// Sprite Domain Layout Components - Public API
// ============================================

// Re-export shared layout components
export {
  SplitView,
  SplitContainer,
  ResizeHandle,
  Panel,
  FloatingWindows,
} from "@/shared/components/layout";

// Sprite-specific panel registry
export {
  registerPanelComponent,
  getPanelContent,
  getPanelTitle,
  isPanelHeaderVisible,
  getPanelDefaultSize,
  getPanelMinSize,
  getRegisteredPanelIds,
  usePanelUpdate,
  subscribeToPanelUpdates,
} from "./PanelRegistry";
