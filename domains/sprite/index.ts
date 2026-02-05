// ============================================
// Sprite Domain - Public API
// ============================================

// Contexts
export { EditorProvider, useEditor, LayoutProvider, useLayout } from "./contexts";

// Components
export {
  SpriteCanvas,
  AnimationPreview,
  FramePreview,
  SpriteSheetImportModal,
  SplitView,
} from "./components";

// Types
export type {
  SpriteFrame,
  SpriteToolMode,
  TimelineMode,
  SavedSpriteProject,
  SpriteEditorState,
  Point,
  Size,
  UnifiedLayer,
  BoundingBox,
  LayoutState,
  SplitNode,
  PanelNode,
  FloatingWindow,
  DropTarget,
  ResizeState,
  SplitDirection,
} from "./types";

// Layout utilities
export {
  DEFAULT_LAYOUT,
  findNode,
  updateNodeSizes,
  addPanelToLayout,
  removePanelFromLayout,
  generateId,
  isSplitNode,
} from "./types";
