import type { Point } from "../types";
import { getBoundingBox } from "./geometry";

export function extractFrameImageFromSource(
  image: HTMLImageElement | null,
  points: Point[],
): string | undefined {
  if (!image || points.length < 3) return undefined;

  const bbox = getBoundingBox(points);
  if (bbox.width <= 0 || bbox.height <= 0) return undefined;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = bbox.width;
  tempCanvas.height = bbox.height;

  const ctx = tempCanvas.getContext("2d");
  if (!ctx) return undefined;

  ctx.beginPath();
  ctx.moveTo(points[0].x - bbox.minX, points[0].y - bbox.minY);
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    ctx.lineTo(point.x - bbox.minX, point.y - bbox.minY);
  }
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(
    image,
    bbox.minX,
    bbox.minY,
    bbox.width,
    bbox.height,
    0,
    0,
    bbox.width,
    bbox.height,
  );

  return tempCanvas.toDataURL("image/png");
}
