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
  FrameStrip,
  SpriteSheetImportModal,
  SpriteMenuBar,
  VideoImportModal,
  FrameBackgroundRemovalModals,
  SplitView,
} from "./components";

// Hooks
export { useFrameBackgroundRemoval } from "./hooks";

// Types
export type {
  SpriteFrame,
  SpriteTrack,
  SpriteToolMode,
  TimelineMode,
  SavedSpriteProject,
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
