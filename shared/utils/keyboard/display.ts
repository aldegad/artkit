import type { ShortcutDefinition, ShortcutBinding } from "./types";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

const MODIFIER_SYMBOLS = {
  ctrl: isMac ? "⌃" : "Ctrl+",
  alt: isMac ? "⌥" : "Alt+",
  shift: isMac ? "⇧" : "Shift+",
  meta: "⌘",
  ctrlOrMeta: isMac ? "⌘" : "Ctrl+",
} as const;

const CODE_DISPLAY: Record<string, string> = {
  Equal: "+",
  Minus: "-",
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
  Delete: "⌫",
  Backspace: "⌫",
  Enter: "↵",
  Escape: "Esc",
  Space: "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
};

function codeToLabel(code: string): string {
  if (CODE_DISPLAY[code]) return CODE_DISPLAY[code];
  if (code.startsWith("Key")) return code.slice(3);
  return code;
}

/**
 * Convert a ShortcutDefinition to a display string.
 * Mac: "⇧⌘Z", Windows: "Ctrl+Shift+Z"
 */
export function shortcutToDisplayString(shortcut: ShortcutDefinition): string {
  const parts: string[] = [];

  if (isMac) {
    // Mac modifier order: ⌃ ⌥ ⇧ ⌘
    if (shortcut.ctrl) parts.push(MODIFIER_SYMBOLS.ctrl);
    if (shortcut.alt) parts.push(MODIFIER_SYMBOLS.alt);
    if (shortcut.shift) parts.push(MODIFIER_SYMBOLS.shift);
    if (shortcut.ctrlOrMeta) parts.push(MODIFIER_SYMBOLS.ctrlOrMeta);
    if (shortcut.meta && !shortcut.ctrlOrMeta) parts.push(MODIFIER_SYMBOLS.meta);
  } else {
    if (shortcut.ctrlOrMeta) parts.push(MODIFIER_SYMBOLS.ctrlOrMeta);
    if (shortcut.ctrl && !shortcut.ctrlOrMeta) parts.push(MODIFIER_SYMBOLS.ctrl);
    if (shortcut.meta) parts.push(MODIFIER_SYMBOLS.meta);
    if (shortcut.alt) parts.push(MODIFIER_SYMBOLS.alt);
    if (shortcut.shift) parts.push(MODIFIER_SYMBOLS.shift);
  }

  parts.push(codeToLabel(shortcut.code));
  return parts.join("");
}

/**
 * Convert a ShortcutBinding (single or first of array) to display string.
 * For menu display, shows only the primary shortcut.
 */
export function bindingToDisplayString(binding: ShortcutBinding): string {
  if (Array.isArray(binding)) {
    return shortcutToDisplayString(
      (binding as readonly ShortcutDefinition[])[0]
    );
  }
  return shortcutToDisplayString(binding as ShortcutDefinition);
}

/**
 * Convert a simple code string to display label.
 * e.g. "KeyV" -> "V", "Space" -> "Space"
 */
export function codeToDisplayLabel(code: string): string {
  return codeToLabel(code);
}
