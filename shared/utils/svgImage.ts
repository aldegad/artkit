interface EmbeddedRasterSvgOptions {
  dataUrl: string;
  width: number;
  height: number;
}

function sanitizeDimension(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}

function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function buildEmbeddedRasterSvg({ dataUrl, width, height }: EmbeddedRasterSvgOptions): string {
  const safeWidth = sanitizeDimension(width);
  const safeHeight = sanitizeDimension(height);
  const escapedDataUrl = escapeXmlAttribute(dataUrl);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">`,
    `  <image href="${escapedDataUrl}" xlink:href="${escapedDataUrl}" width="${safeWidth}" height="${safeHeight}" preserveAspectRatio="none" />`,
    "</svg>",
  ].join("\n");
}

export function createSvgBlobFromCanvas(canvas: HTMLCanvasElement): Blob {
  const dataUrl = canvas.toDataURL("image/png");
  const svg = buildEmbeddedRasterSvg({
    dataUrl,
    width: canvas.width,
    height: canvas.height,
  });
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}
