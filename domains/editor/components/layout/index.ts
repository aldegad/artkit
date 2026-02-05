// ============================================
// Editor Layout Components - Public API
// ============================================

// Re-export shared layout components
export {
  SplitView as EditorSplitView,
  SplitContainer as EditorSplitContainer,
  Panel as EditorPanel,
  ResizeHandle as EditorResizeHandle,
  FloatingWindows as EditorFloatingWindows,
} from "@/shared/components/layout";

// Editor-specific panel registry
export {
  registerEditorPanelComponent,
  clearEditorPanelComponents,
  getEditorPanelContent,
  getEditorPanelTitle,
  isEditorPanelHeaderVisible,
  getEditorPanelDefaultSize,
  getEditorPanelMinSize,
  getRegisteredEditorPanelIds,
  usePanelUpdate,
} from "./EditorPanelRegistry";
