const MIN_TIMELINE_ZOOM = 0.001;

export function normalizeTimelineZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_TIMELINE_ZOOM;
  return Math.max(MIN_TIMELINE_ZOOM, zoom);
}

export function timelineTimeToPixel(time: number, scrollX: number, zoom: number): number {
  const safeTime = Number.isFinite(time) ? time : 0;
  const safeScrollX = Math.max(0, Number.isFinite(scrollX) ? scrollX : 0);
  return (safeTime - safeScrollX) * normalizeTimelineZoom(zoom);
}

export function pixelToTimelineTime(pixel: number, scrollX: number, zoom: number): number {
  const safePixel = Number.isFinite(pixel) ? pixel : 0;
  const safeScrollX = Math.max(0, Number.isFinite(scrollX) ? scrollX : 0);
  return safeScrollX + safePixel / normalizeTimelineZoom(zoom);
}

export function panTimelineScrollXByPixels(scrollX: number, deltaPixels: number, zoom: number): number {
  const safeScrollX = Math.max(0, Number.isFinite(scrollX) ? scrollX : 0);
  const safeDeltaPixels = Number.isFinite(deltaPixels) ? deltaPixels : 0;
  return Math.max(0, safeScrollX + safeDeltaPixels / normalizeTimelineZoom(zoom));
}

export function zoomTimelineAtPixel(
  scrollX: number,
  currentZoom: number,
  nextZoom: number,
  anchorPixel: number
): number {
  const safeAnchor = Number.isFinite(anchorPixel) ? anchorPixel : 0;
  const currentTimeAtAnchor = pixelToTimelineTime(safeAnchor, scrollX, currentZoom);
  return Math.max(0, currentTimeAtAnchor - safeAnchor / normalizeTimelineZoom(nextZoom));
}

export function timelineScrollXFromGestureAnchor(
  gestureStartScrollX: number,
  gestureStartClientX: number,
  currentClientX: number,
  zoom: number
): number {
  const deltaPixels = gestureStartClientX - currentClientX;
  return panTimelineScrollXByPixels(gestureStartScrollX, deltaPixels, zoom);
}

export function timelineZoomFromWheelDelta(
  currentZoom: number,
  deltaY: number,
  wheelZoomFactor: number
): number {
  const zoomFactor = deltaY < 0 ? 1 + wheelZoomFactor : 1 / (1 + wheelZoomFactor);
  return normalizeTimelineZoom(currentZoom * zoomFactor);
}
