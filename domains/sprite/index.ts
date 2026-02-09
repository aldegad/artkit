// ============================================
// Sprite Domain - Public API
// ============================================

// Contexts
export {
  EditorProvider,
  useEditorRefs,
  useEditorImage,
  useEditorFrames,
  useEditorFramesMeta,
  useEditorTools,
  useEditorViewport,
  useEditorAnimation,
  useEditorDrag,
  useEditorWindows,
  useEditorBrush,
  useEditorHistory,
  useEditorTracks,
  useEditorProject,
  useEditorClipboard,
  LayoutProvider,
  useLayout,
} from "./contexts";

// Components
export {
  SpriteCanvas,
  AnimationPreview,
  FramePreview,
  FrameStrip,
  SpriteSheetImportModal,
  SpriteMenuBar,
  SpriteTopToolbar,
  VideoImportModal,
  FrameBackgroundRemovalModals,
  SplitView,
} from "./components";

// Hooks
export { useFrameBackgroundRemoval, useSpriteKeyboardShortcuts } from "./hooks";

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
