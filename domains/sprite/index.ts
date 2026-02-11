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
  SpriteToolOptionsBar,
  VideoImportModal,
  FrameBackgroundRemovalModals,
  FrameInterpolationModals,
  SpriteExportModal,
  SpriteResampleModal,
  SplitView,
} from "./components";

// Hooks
export { useFrameBackgroundRemoval, useFrameInterpolation, useSpriteKeyboardShortcuts, useSpriteExport } from "./hooks";

// Types
export type {
  SpriteFrame,
  SpriteTrack,
  SpriteToolMode,
  MagicWandSelectionMode,
  FrameEditToolMode,
  TimelineMode,
  SavedSpriteProject,
  Point,
  Size,
  UnifiedLayer,
  BoundingBox,
} from "./types";
export type { SpriteResampleSettings, SpriteResampleQuality } from "./components";
