function clampFeatherRadius(feather: number, width: number, height: number): number {
  const safeFeather = Number.isFinite(feather) ? feather : 0;
  const maxRadius = Math.max(0, Math.floor(Math.min(width, height) / 2));
  return Math.max(0, Math.min(Math.round(safeFeather), maxRadius));
}

function edgeFeatherWeight(x: number, y: number, width: number, height: number, feather: number): number {
  if (feather <= 0) return 1;

  const distToEdge = Math.min(x + 0.5, y + 0.5, width - (x + 0.5), height - (y + 0.5));
  if (distToEdge <= 0) return 0;
  if (distToEdge >= feather) return 1;

  const t = distToEdge / feather;
  // Smoothstep easing for a less harsh transition near the edge.
  return t * t * (3 - 2 * t);
}

export function applyFeatherToImageData(imageData: ImageData, feather: number): ImageData {
  const { width, height } = imageData;
  const featherRadius = clampFeatherRadius(feather, width, height);
  if (featherRadius <= 0) {
    return imageData;
  }

  const output = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
  const data = output.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const weight = edgeFeatherWeight(x, y, width, height, featherRadius);
      if (weight >= 1) continue;

      const alphaIndex = (y * width + x) * 4 + 3;
      data[alphaIndex] = Math.round(data[alphaIndex] * weight);
    }
  }

  return output;
}

export function clearRectWithFeather(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  feather: number
): void {
  const w = Math.max(0, Math.round(width));
  const h = Math.max(0, Math.round(height));
  if (w === 0 || h === 0) return;

  const featherRadius = clampFeatherRadius(feather, w, h);
  const drawX = Math.round(x);
  const drawY = Math.round(y);

  if (featherRadius <= 0 || typeof document === "undefined") {
    ctx.clearRect(drawX, drawY, w, h);
    return;
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) {
    ctx.clearRect(drawX, drawY, w, h);
    return;
  }

  const maskData = maskCtx.createImageData(w, h);
  const data = maskData.data;

  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const alpha = Math.round(edgeFeatherWeight(px, py, w, h, featherRadius) * 255);
      const idx = (py * w + px) * 4;
      data[idx + 3] = alpha;
    }
  }

  maskCtx.putImageData(maskData, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(maskCanvas, drawX, drawY);
  ctx.restore();
}
