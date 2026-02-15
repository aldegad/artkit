export interface CanvasPixelPoint {
  x: number;
  y: number;
}

export function getCanvasPixelCoordinates(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  zoom: number,
): CanvasPixelPoint | null {
  if (zoom <= 0) return null;

  const rect = canvas.getBoundingClientRect();
  const style = getComputedStyle(canvas);
  const borderLeft = parseFloat(style.borderLeftWidth) || 0;
  const borderTop = parseFloat(style.borderTopWidth) || 0;
  const borderRight = parseFloat(style.borderRightWidth) || 0;
  const borderBottom = parseFloat(style.borderBottomWidth) || 0;

  const contentWidth = rect.width - borderLeft - borderRight;
  const contentHeight = rect.height - borderTop - borderBottom;
  if (contentWidth <= 0 || contentHeight <= 0) return null;

  const scaleX = canvas.width / contentWidth;
  const scaleY = canvas.height / contentHeight;
  const effectiveZoomX = zoom * scaleX;
  const effectiveZoomY = zoom * scaleY;
  if (effectiveZoomX <= 0 || effectiveZoomY <= 0) return null;

  return {
    x: Math.floor(((clientX - rect.left - borderLeft) * scaleX) / effectiveZoomX),
    y: Math.floor(((clientY - rect.top - borderTop) * scaleY) / effectiveZoomY),
  };
}
