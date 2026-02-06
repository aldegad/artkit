import type { ShortcutDefinition } from "./types";

/**
 * Common shortcuts shared across all domains.
 * Domains import what they need; they don't have to use all of them.
 */
export const COMMON_SHORTCUTS = {
  // History
  undo: { code: "KeyZ", ctrlOrMeta: true } as ShortcutDefinition,
  redo: [
    { code: "KeyZ", ctrlOrMeta: true, shift: true },
    { code: "KeyY", ctrlOrMeta: true },
  ] as readonly ShortcutDefinition[],

  // File operations
  save: { code: "KeyS", ctrlOrMeta: true } as ShortcutDefinition,
  saveAs: { code: "KeyS", ctrlOrMeta: true, shift: true } as ShortcutDefinition,
  open: { code: "KeyO", ctrlOrMeta: true } as ShortcutDefinition,
  newFile: { code: "KeyN", ctrlOrMeta: true } as ShortcutDefinition,

  // Clipboard
  copy: { code: "KeyC", ctrlOrMeta: true } as ShortcutDefinition,
  cut: { code: "KeyX", ctrlOrMeta: true } as ShortcutDefinition,
  paste: { code: "KeyV", ctrlOrMeta: true } as ShortcutDefinition,

  // Zoom (with Cmd/Ctrl modifier)
  zoomIn: { code: "Equal", ctrlOrMeta: true } as ShortcutDefinition,
  zoomOut: { code: "Minus", ctrlOrMeta: true } as ShortcutDefinition,
  resetZoom: { code: "Digit0", ctrlOrMeta: true } as ShortcutDefinition,

  // Simple code-based shortcuts
  cancel: "Escape",
  confirm: "Enter",
  delete: ["Delete", "Backspace"] as readonly string[],
  space: "Space",
} as const;
