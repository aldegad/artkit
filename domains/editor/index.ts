// ============================================
// Editor Domain - Public API
// ============================================

// Hooks
export { useLayerManagement } from "./hooks";
export { useHistory } from "./hooks";
export { useBrushTool } from "./hooks";
export { useCanvasInput } from "./hooks";
export { useSelectionTool, useCropTool, useKeyboardShortcuts, useMouseHandlers, useCanvasRendering, useBackgroundRemoval } from "./hooks";
export type {
  CanvasInputEvent,
  InputModifiers,
  InputType,
  EditorTool,
  ToolContext,
} from "./hooks";

// Components
export { ProjectListModal } from "./components";
export { EditorToolOptions } from "./components";
export { EditorStatusBar } from "./components";
export { BackgroundRemovalModals } from "./components";
export { EditorMenuBar } from "./components";
export { LayersPanelContent } from "./components";
export { BrushPresetSelector } from "./components/toolbars/BrushPresetSelector";
export { PanModeToggle } from "./components/toolbars/PanModeToggle";

// Contexts
export { EditorLayersProvider, useEditorLayers } from "./contexts";
export type { EditorLayersContextValue } from "./contexts";

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
  BoundingBox,
  // Brush preset types
  PressureSettings,
  BrushPresetType,
  BrushPreset,
  DrawingParameters,
} from "./types";

export { ASPECT_RATIOS, ASPECT_RATIO_VALUES } from "./types";

// Layer helper functions
export {
  createLayerWithSize,
  createPaintLayer,
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

// Constants
export {
  TOOL_SHORTCUTS,
  BRUSH_SIZE_SHORTCUTS,
  ZOOM_SHORTCUTS,
  HISTORY_SHORTCUTS,
  CLIPBOARD_SHORTCUTS,
  FILE_SHORTCUTS,
  SPECIAL_SHORTCUTS,
  hasCmdOrCtrl,
  matchesShortcut,
  matchesToolShortcut,
  matchesAnyCodes,
  // Brush presets
  DEFAULT_BRUSH_PRESETS,
  calculateDrawingParameters,
  loadCustomPresets,
  saveCustomPresets,
  loadActivePresetId,
  saveActivePresetId,
  BRUSH_PRESETS_STORAGE_KEY,
  ACTIVE_PRESET_STORAGE_KEY,
} from "./constants";

export type { ShortcutDefinition } from "./constants";
