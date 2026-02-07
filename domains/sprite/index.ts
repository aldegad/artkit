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
} from "./types";
