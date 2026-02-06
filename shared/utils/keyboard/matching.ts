import type {
  ShortcutDefinition,
  ShortcutBinding,
  ToolShortcutMap,
} from "./types";

/**
 * Cross-platform Cmd/Ctrl check
 */
export function hasCmdOrCtrl(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

/**
 * Check if a keyboard event matches a shortcut definition.
 * Includes strict shift check to prevent Cmd+Z matching Cmd+Shift+Z.
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
  // Prevent Cmd+Z from matching Cmd+Shift+Z
  if (!shortcut.shift && event.shiftKey && shortcut.ctrlOrMeta) return false;
  if (shortcut.alt && !event.altKey) return false;

  return true;
}

/**
 * Check if event matches any shortcut in a binding (single or array).
 */
export function matchesBinding(
  event: KeyboardEvent,
  binding: ShortcutBinding
): boolean {
  if (Array.isArray(binding)) {
    return (binding as readonly ShortcutDefinition[]).some((s) =>
      matchesShortcut(event, s)
    );
  }
  return matchesShortcut(event, binding as ShortcutDefinition);
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

/**
 * Match a tool shortcut from a map. Returns the tool mode or null.
 * Only matches when no modifier keys are held.
 */
export function matchesToolShortcut<T extends string>(
  event: KeyboardEvent,
  toolMap: ToolShortcutMap<T>
): T | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  return (toolMap[event.code] as T) ?? null;
}
