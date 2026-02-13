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
  SpriteFrameExportModal,
  SpriteResampleModal,
  SplitView,
} from "./components";

// Hooks
export {
  useFrameBackgroundRemoval,
  useFrameFill,
  useFrameInterpolation,
  useSpriteKeyboardShortcuts,
  useSpriteExport,
  useSpriteProjectFileActions,
  useSpriteProjectSync,
  useSpriteExportActions,
  useSpriteCropActions,
  useFrameStripSkipActions,
  useSpriteResampleActions,
  useFrameStripTransformActions,
  useSpritePreviewBackgroundState,
  useFrameStripImportHandlers,
  useSpriteEditableFrameCanvasSync,
} from "./hooks";

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
