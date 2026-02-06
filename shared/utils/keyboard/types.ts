/**
 * Keyboard Shortcut Types
 *
 * Uses e.code (physical key position) instead of e.key (character)
 * to support shortcuts regardless of keyboard input language (Korean/English).
 */

export interface ShortcutDefinition {
  code: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** true = Cmd on Mac, Ctrl on Windows/Linux */
  ctrlOrMeta?: boolean;
}

/**
 * A single shortcut or array of alternatives
 * (e.g. Cmd+Shift+Z OR Cmd+Y for redo)
 */
export type ShortcutBinding =
  | ShortcutDefinition
  | readonly ShortcutDefinition[];

/**
 * Maps a physical key code to a tool mode string.
 * Generic so each domain uses its own tool mode type.
 */
export type ToolShortcutMap<T extends string> = Record<string, T>;
