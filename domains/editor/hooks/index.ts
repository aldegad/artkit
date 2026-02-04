// ============================================
// Editor Domain Hooks - Public API
// ============================================

export { useLayerManagement } from "./useLayerManagement";
export { useHistory } from "./useHistory";
export { useBrushTool } from "./useBrushTool";
export { useCanvasInput } from "./useCanvasInput";
export type {
  CanvasInputEvent,
  InputModifiers,
  InputType,
  UseCanvasInputOptions,
  UseCanvasInputReturn,
} from "./useCanvasInput";

// Tool types and hooks
export type {
  EditorTool,
  ToolContext,
  BrushToolState,
  SelectionToolState,
  CropToolState,
} from "./tools";

export { useSelectionTool, useCropTool } from "./tools";
export { useKeyboardShortcuts } from "./useKeyboardShortcuts";
export { useProjectManagement } from "./useProjectManagement";
export { useMouseHandlers } from "./useMouseHandlers";
export { useCanvasRendering } from "./useCanvasRendering";
export { useBackgroundRemoval } from "./useBackgroundRemoval";
