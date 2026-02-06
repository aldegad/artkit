/**
 * Keyboard Shortcut Configuration
 *
 * Uses e.code (physical key position) instead of e.key (character)
 * to support shortcuts regardless of keyboard input language (Korean/English)
 */

import { EditorToolMode } from "../types";

// ============================================
// Types
// ============================================

export interface ShortcutDefinition {
  code: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  ctrlOrMeta?: boolean;
}

// ============================================
// Shortcut Configurations
// ============================================

/**
 * Tool mode shortcuts - single keys without modifiers
 */
export const TOOL_SHORTCUTS: Record<string, EditorToolMode> = {
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
  applyTransform: "Enter",
  cancelTransform: "Escape",
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
  undo: { code: "KeyZ", ctrlOrMeta: true } as const,
  redo: [
    { code: "KeyZ", ctrlOrMeta: true, shift: true },
    { code: "KeyY", ctrlOrMeta: true },
  ] as const,
};

/**
 * Clipboard shortcuts
 */
export const CLIPBOARD_SHORTCUTS = {
  copy: { code: "KeyC", ctrlOrMeta: true } as const,
  paste: { code: "KeyV", ctrlOrMeta: true } as const,
};

/**
 * File operation shortcuts
 */
export const FILE_SHORTCUTS = {
  new: { code: "KeyN", ctrlOrMeta: true } as const,
  save: { code: "KeyS", ctrlOrMeta: true } as const,
  saveAs: { code: "KeyS", ctrlOrMeta: true, shift: true } as const,
};

/**
 * Special key shortcuts
 */
export const SPECIAL_SHORTCUTS = {
  temporaryHand: "Space",
  cancel: "Escape",
} as const;

// ============================================
// Helper Functions
// ============================================

/**
 * Check if event has Cmd/Ctrl modifier (cross-platform)
 */
export function hasCmdOrCtrl(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

/**
 * Check if a keyboard event matches a shortcut definition
 */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutDefinition
): boolean {
  if (event.code !== shortcut.code) return false;

  if (shortcut.ctrlOrMeta) {
    if (!event.ctrlKey && !event.metaKey) return false;
  } else {
    if (shortcut.ctrl && !event.ctrlKey) return false;
    if (shortcut.meta && !event.metaKey) return false;
  }

  if (shortcut.shift && !event.shiftKey) return false;
  if (shortcut.alt && !event.altKey) return false;

  return true;
}

/**
 * Check if a keyboard event matches a tool shortcut (no modifiers)
 * Returns the tool mode or null if no match
 */
export function matchesToolShortcut(
  event: KeyboardEvent
): EditorToolMode | null {
  if (event.metaKey || event.ctrlKey) return null;
  return TOOL_SHORTCUTS[event.code] ?? null;
}

/**
 * Check if event matches any code in an array
 */
export function matchesAnyCodes(
  event: KeyboardEvent,
  codes: readonly string[]
): boolean {
  return codes.includes(event.code);
}
