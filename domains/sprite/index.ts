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
  FrameStrip,
  SpriteSheetImportModal,
  SpriteMenuBar,
  SpriteTopToolbar,
  SpritePanModeToggle,
  SpriteToolOptionsBar,
  VideoImportModal,
  FrameBackgroundRemovalModals,
  FrameInterpolationModals,
  SplitView,
} from "./components";

// Hooks
export { useFrameBackgroundRemoval, useFrameInterpolation, useSpriteKeyboardShortcuts } from "./hooks";

// Types
export type {
  SpriteFrame,
  SpriteTrack,
  SpriteToolMode,
  FrameEditToolMode,
  TimelineMode,
  SavedSpriteProject,
  Point,
  Size,
  UnifiedLayer,
  BoundingBox,
} from "./types";
