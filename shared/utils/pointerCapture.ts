export function safeSetPointerCapture(target: EventTarget | null | undefined, pointerId: number): boolean {
  if (!(target instanceof Element)) return false;
  if (typeof target.setPointerCapture !== "function") return false;

  try {
    target.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

export function safeReleasePointerCapture(target: EventTarget | null | undefined, pointerId: number): boolean {
  if (!(target instanceof Element)) return false;
  if (
    typeof target.hasPointerCapture !== "function"
    || typeof target.releasePointerCapture !== "function"
  ) {
    return false;
  }

  try {
    if (!target.hasPointerCapture(pointerId)) return false;
    target.releasePointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

