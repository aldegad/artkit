export { cn } from "./cn";
export { generateId } from "./generateId";
export { downloadDataUrl, downloadBlob, downloadJson, downloadText } from "./download";

// Brush engine
export { drawDab, drawLine, parseHexColor } from "./brushEngine";
export type { DabParams, LineParams } from "./brushEngine";

// Canvas viewport
export { ViewportEmitter } from "./viewportEmitter";
export type { ViewportState } from "./viewportEmitter";
export {
  screenToContent,
  contentToCanvas,
  calculateRenderOffset,
  zoomAtPoint,
  clampZoom,
  calculateFitScale,
  screenToCanvasPixel,
  getTouchDistance,
  getTouchCenter,
  DEFAULT_VIEWPORT_CONFIG,
} from "./canvasViewport";
export type { ViewportConfig, ViewportTransform } from "./canvasViewport";

// Autosave
export { createAutosave, createIndexedDBStorage } from "./autosave";
export type { AutosaveConfig, AutosaveStorage, BaseAutosaveData } from "./autosave";

// Rect transform
export {
  getRectHandles,
  isPointInRect,
  getRectHandleAtPosition,
  resizeRectByHandle,
  createRectFromDrag,
  clampRectToBounds,
} from "./rectTransform";
export type {
  Rect,
  RectHandle,
  RectHit,
  RectHandlePoint,
  RectBounds,
  GetRectHandleAtPositionOptions,
  ResizeRectByHandleOptions,
  CreateRectFromDragOptions,
} from "./rectTransform";

// Keyboard shortcuts
export {
  COMMON_SHORTCUTS,
  hasCmdOrCtrl,
  matchesShortcut,
  matchesBinding,
  matchesAnyCodes,
  matchesToolShortcut,
  shortcutToDisplayString,
  bindingToDisplayString,
  codeToDisplayLabel,
  shouldIgnoreKeyEvent,
} from "./keyboard";
export type {
  ShortcutDefinition,
  ShortcutBinding,
  ToolShortcutMap,
} from "./keyboard";
