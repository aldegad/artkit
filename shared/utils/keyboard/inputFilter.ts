/**
 * Returns true if the keyboard event should be ignored
 * (target is an interactive input element).
 */
export function shouldIgnoreKeyEvent(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;

  return (
    target.tagName === "INPUT" ||
    target.tagName === "SELECT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}
