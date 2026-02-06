/**
 * Video Editor Keyboard Shortcut Configuration
 *
 * Uses e.code (physical key position) instead of e.key (character)
 * to support shortcuts regardless of keyboard input language (Korean/English).
 *
 * Mirrors the pattern from domains/editor/constants/keyboardShortcuts.ts
 */

import { VideoToolMode } from "../types";

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
// Tool Shortcuts (single key, no modifiers)
// ============================================

export const VIDEO_TOOL_SHORTCUTS: Record<string, VideoToolMode> = {
  KeyV: "select",
  KeyR: "crop",
  KeyT: "trim",
  KeyC: "razor",
  KeyM: "mask",
};

// ============================================
// Playback Shortcuts
// ============================================

export const PLAYBACK_SHORTCUTS = {
  togglePlay: "Space",
  stepForward: "ArrowRight",
  stepBackward: "ArrowLeft",
} as const;

// ============================================
// Edit Shortcuts (with Cmd/Ctrl modifier)
// ============================================

export const VIDEO_EDIT_SHORTCUTS = {
  undo: { code: "KeyZ", ctrlOrMeta: true } as ShortcutDefinition,
  redo: [
    { code: "KeyZ", ctrlOrMeta: true, shift: true } as ShortcutDefinition,
    { code: "KeyY", ctrlOrMeta: true } as ShortcutDefinition,
  ],
  save: { code: "KeyS", ctrlOrMeta: true } as ShortcutDefinition,
  open: { code: "KeyO", ctrlOrMeta: true } as ShortcutDefinition,
  copy: { code: "KeyC", ctrlOrMeta: true } as ShortcutDefinition,
  cut: { code: "KeyX", ctrlOrMeta: true } as ShortcutDefinition,
  paste: { code: "KeyV", ctrlOrMeta: true } as ShortcutDefinition,
  duplicate: { code: "KeyD", shift: true } as ShortcutDefinition,
};

// ============================================
// Zoom Shortcuts (with Cmd/Ctrl) — preview zoom
// ============================================

export const VIDEO_ZOOM_SHORTCUTS = {
  zoomIn: { code: "Equal", ctrlOrMeta: true } as ShortcutDefinition,
  zoomOut: { code: "Minus", ctrlOrMeta: true } as ShortcutDefinition,
  fitToScreen: { code: "Digit0", ctrlOrMeta: true } as ShortcutDefinition,
};

// ============================================
// Context-specific Shortcuts
// ============================================

export const VIDEO_CONTEXT_SHORTCUTS = {
  applyCrop: "Enter",
  cancel: "Escape",
  delete: ["Delete", "Backspace"] as readonly string[],
};

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
  if (!shortcut.shift && event.shiftKey && shortcut.ctrlOrMeta) return false;
  if (shortcut.alt && !event.altKey) return false;

  return true;
}

/**
 * Check if a keyboard event matches a tool shortcut (no modifiers)
 * Returns the tool mode or null if no match
 */
export function matchesVideoToolShortcut(
  event: KeyboardEvent
): VideoToolMode | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  return VIDEO_TOOL_SHORTCUTS[event.code] ?? null;
}

/**
 * Check if event code matches any code in an array
 */
export function matchesAnyCodes(
  event: KeyboardEvent,
  codes: readonly string[]
): boolean {
  return codes.includes(event.code);
}
