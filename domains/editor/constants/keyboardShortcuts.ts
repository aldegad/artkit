/**
 * Editor Keyboard Shortcut Configuration
 *
 * Domain-specific shortcuts for the image editor.
 * Common shortcuts and utilities are imported from shared/utils/keyboard.
 */

import { EditorToolMode } from "../types";
import { COMMON_SHORTCUTS } from "@/shared/utils/keyboard";
import type { ToolShortcutMap } from "@/shared/utils/keyboard";

// Re-export shared types and utilities for backward compatibility
export type { ShortcutDefinition } from "@/shared/utils/keyboard";
export {
  hasCmdOrCtrl,
  matchesShortcut,
  matchesAnyCodes,
} from "@/shared/utils/keyboard";

// ============================================
// Editor-specific Shortcut Configurations
// ============================================

/**
 * Tool mode shortcuts - single keys without modifiers
 */
export const TOOL_SHORTCUTS: ToolShortcutMap<EditorToolMode> = {
  KeyC: "crop",
  KeyH: "hand",
  KeyZ: "zoom",
  KeyB: "brush",
  KeyE: "eraser",
  KeyG: "fill",
  KeyI: "eyedropper",
  KeyS: "stamp",
  KeyM: "marquee",
  KeyV: "move",
  KeyT: "transform",
};

/**
 * Transform tool shortcuts (with Cmd/Ctrl modifier)
 */
export const TRANSFORM_SHORTCUTS = {
  enterTransform: { code: "KeyT", ctrlOrMeta: true } as const,
  applyTransform: COMMON_SHORTCUTS.confirm,
  cancelTransform: COMMON_SHORTCUTS.cancel,
} as const;

/**
 * Brush size adjustment shortcuts
 */
export const BRUSH_SIZE_SHORTCUTS = {
  decrease: ["BracketLeft", "Minus"] as const,
  increase: ["BracketRight", "Equal"] as const,
};

/**
 * Zoom shortcuts (with Cmd/Ctrl modifier)
 */
export const ZOOM_SHORTCUTS = {
  zoomIn: ["Equal"] as const,
  zoomOut: ["Minus"] as const,
  resetZoom: ["Digit0"] as const,
};

/**
 * History shortcuts (Undo/Redo)
 */
export const HISTORY_SHORTCUTS = {
  undo: COMMON_SHORTCUTS.undo,
  redo: COMMON_SHORTCUTS.redo,
};

/**
 * Clipboard shortcuts
 */
export const CLIPBOARD_SHORTCUTS = {
  copy: COMMON_SHORTCUTS.copy,
  paste: COMMON_SHORTCUTS.paste,
};

/**
 * File operation shortcuts
 */
export const FILE_SHORTCUTS = {
  save: COMMON_SHORTCUTS.save,
};

/**
 * Special key shortcuts
 */
export const SPECIAL_SHORTCUTS = {
  temporaryHand: COMMON_SHORTCUTS.space,
  cancel: COMMON_SHORTCUTS.cancel,
} as const;

// ============================================
// Editor-specific Helper Functions
// ============================================

/**
 * Check if a keyboard event matches an editor tool shortcut (no modifiers)
 * Returns the tool mode or null if no match
 */
export function matchesToolShortcut(
  event: KeyboardEvent
): EditorToolMode | null {
  if (event.metaKey || event.ctrlKey) return null;
  return TOOL_SHORTCUTS[event.code] ?? null;
}
