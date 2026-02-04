// ============================================
// Editor Domain - Public API
// ============================================

// Hooks
export { useLayerManagement } from "./hooks";
export { useHistory } from "./hooks";
export { useBrushTool } from "./hooks";

// Components
export { ProjectListModal } from "./components";
export { EditorToolOptions } from "./components";
export { EditorStatusBar } from "./components";

// Types
export type {
  EditorToolMode,
  AspectRatio,
  OutputFormat,
  DragType,
  CropArea,
  SavedImageProject,
  AspectRatioOption,
  Point,
  Size,
  UnifiedLayer,
  // Legacy types (deprecated)
  CompositionLayer,
  ImageLayer,
  BoundingBox,
} from "./types";

export { ASPECT_RATIOS, ASPECT_RATIO_VALUES } from "./types";

// Layer helper functions
export {
  createLayerWithSize,
  createPaintLayer,
  compositionLayerToUnified,
  imageLayerToUnified,
} from "./types";

// Utils
export {
  loadEditorAutosaveData,
  saveEditorAutosaveData,
  clearEditorAutosaveData,
  EDITOR_AUTOSAVE_KEY,
  EDITOR_AUTOSAVE_DEBOUNCE_MS,
} from "./utils";

export type { EditorAutosaveData } from "./utils";
