/**
 * 빈 캔버스 크기 히스토리 (localStorage, 최대 6개, 최신순)
 */

const STORAGE_KEY = "artkit-image-blank-canvas-size-history";
const MAX_HISTORY = 6;

export interface CanvasSizeEntry {
  width: number;
  height: number;
}

export function getBlankCanvasSizeHistory(): CanvasSizeEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is CanvasSizeEntry => (
        item != null
        && typeof item === "object"
        && typeof (item as CanvasSizeEntry).width === "number"
        && typeof (item as CanvasSizeEntry).height === "number"
        && (item as CanvasSizeEntry).width >= 1
        && (item as CanvasSizeEntry).height >= 1
      ))
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function pushBlankCanvasSizeHistory(width: number, height: number): void {
  if (width < 1 || height < 1) return;
  const prev = getBlankCanvasSizeHistory();
  const next = [
    { width, height },
    ...prev.filter((e) => !(e.width === width && e.height === height)),
  ].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
