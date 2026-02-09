const MIN_TIMELINE_ZOOM = 0.001;

export function normalizeTimelineZoom(zoom: number): number {
  return Math.max(MIN_TIMELINE_ZOOM, zoom);
}

export function timelineTimeToPixel(time: number, scrollX: number, zoom: number): number {
  return (time - scrollX) * normalizeTimelineZoom(zoom);
}

export function pixelToTimelineTime(pixel: number, scrollX: number, zoom: number): number {
  return scrollX + pixel / normalizeTimelineZoom(zoom);
}

export function panTimelineScrollXByPixels(scrollX: number, deltaPixels: number, zoom: number): number {
  return Math.max(0, scrollX + deltaPixels / normalizeTimelineZoom(zoom));
}

export function zoomTimelineAtPixel(
  scrollX: number,
  currentZoom: number,
  nextZoom: number,
  anchorPixel: number
): number {
  const currentTimeAtAnchor = pixelToTimelineTime(anchorPixel, scrollX, currentZoom);
  return Math.max(0, currentTimeAtAnchor - anchorPixel / normalizeTimelineZoom(nextZoom));
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
