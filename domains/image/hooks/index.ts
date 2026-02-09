// ============================================
// Editor Domain Hooks - Public API
// ============================================

export { useLayerManagement } from "./useLayerManagement";
export { useHistory } from "./useHistory";
export type { HistoryAdapter } from "./useHistory";
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
export { useMouseHandlers } from "./useMouseHandlers";
export { useCanvasRendering } from "./useCanvasRendering";
export { useBackgroundRemoval } from "./useBackgroundRemoval";
export { useTransformTool } from "./useTransformTool";
export type { TransformState, TransformHandle } from "./useTransformTool";
export { useCoordinateTransform } from "./useCoordinateTransform";
export type {
  UseCoordinateTransformOptions,
  UseCoordinateTransformReturn,
} from "./useCoordinateTransform";

// Snap system
export { useSnapSystem } from "./useSnapSystem";
export type { UseSnapSystemOptions, UseSnapSystemReturn } from "./useSnapSystem";

// Guide tool
export { useGuideTool } from "./useGuideTool";
export type { UseGuideToolOptions, UseGuideToolReturn } from "./useGuideTool";

// Save hook
export { useEditorSave } from "./useEditorSave";
export type { UseEditorSaveOptions, UseEditorSaveReturn } from "./useEditorSave";

// Export hook
export { useImageExport } from "./useImageExport";

// Project I/O hook
export { useImageProjectIO } from "./useImageProjectIO";

// Save actions hook
export { useEditorSaveActions } from "./useEditorSaveActions";
