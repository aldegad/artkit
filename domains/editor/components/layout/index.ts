// ============================================
// Editor Layout Components - Public API
// ============================================

export { default as EditorSplitContainer } from "./EditorSplitContainer";
export { default as EditorPanel } from "./EditorPanel";
export { default as EditorResizeHandle } from "./EditorResizeHandle";
export { default as EditorFloatingWindows } from "./EditorFloatingWindows";

export {
  registerEditorPanelComponent,
  clearEditorPanelComponents,
  getEditorPanelContent,
  getEditorPanelTitle,
  isEditorPanelHeaderVisible,
  getEditorPanelDefaultSize,
  getEditorPanelMinSize,
  getRegisteredEditorPanelIds,
} from "./EditorPanelRegistry";
