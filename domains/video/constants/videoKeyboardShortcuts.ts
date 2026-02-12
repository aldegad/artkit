/**
 * Video Editor Keyboard Shortcut Configuration
 *
 * Domain-specific shortcuts for the video editor.
 * Common shortcuts and utilities are imported from shared/utils/keyboard.
 */

import { VideoToolMode } from "../types";
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
// Tool Shortcuts (single key, no modifiers)
// ============================================

export const VIDEO_TOOL_SHORTCUTS: ToolShortcutMap<VideoToolMode> = {
  KeyV: "select",
  KeyT: "transform",
  KeyH: "hand",
  KeyZ: "zoom",
  KeyR: "crop",
  KeyC: "razor",
  KeyM: "mask",
};

export const VIDEO_TRANSFORM_SHORTCUTS = {
  enterTransform: { code: "KeyT", ctrlOrMeta: true } as const,
  applyTransform: COMMON_SHORTCUTS.confirm,
  cancelTransform: COMMON_SHORTCUTS.cancel,
} as const;

// ============================================
// Playback Shortcuts
// ============================================

export const PLAYBACK_SHORTCUTS = {
  togglePlay: COMMON_SHORTCUTS.space,
  stepForward: "ArrowRight",
  stepBackward: "ArrowLeft",
} as const;

// ============================================
// Edit Shortcuts (with Cmd/Ctrl modifier)
// ============================================

export const VIDEO_EDIT_SHORTCUTS = {
  undo: COMMON_SHORTCUTS.undo,
  redo: COMMON_SHORTCUTS.redo,
  save: COMMON_SHORTCUTS.save,
  open: COMMON_SHORTCUTS.open,
  copy: COMMON_SHORTCUTS.copy,
  cut: COMMON_SHORTCUTS.cut,
  paste: COMMON_SHORTCUTS.paste,
  duplicate: { code: "KeyD", shift: true } as const,
};

// ============================================
// Zoom Shortcuts (with Cmd/Ctrl) — timeline zoom
// ============================================

export const VIDEO_ZOOM_SHORTCUTS = {
  zoomIn: COMMON_SHORTCUTS.zoomIn,
  zoomOut: COMMON_SHORTCUTS.zoomOut,
  fitToScreen: COMMON_SHORTCUTS.resetZoom,
};

// ============================================
// Context-specific Shortcuts
// ============================================

export const VIDEO_CONTEXT_SHORTCUTS = {
  applyCrop: COMMON_SHORTCUTS.confirm,
  cancel: COMMON_SHORTCUTS.cancel,
  delete: COMMON_SHORTCUTS.delete,
};

// ============================================
// Video-specific Helper Functions
// ============================================

/**
 * Check if a keyboard event matches a video tool shortcut (no modifiers)
 * Returns the tool mode or null if no match
 */
export function matchesVideoToolShortcut(
  event: KeyboardEvent
): VideoToolMode | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  return VIDEO_TOOL_SHORTCUTS[event.code] ?? null;
}
