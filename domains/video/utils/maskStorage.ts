import { Size } from "@/shared/types";

/**
 * Encode mask canvas to base64 string (grayscale only for efficiency)
 */
export function encodeMask(canvas: HTMLCanvasElement): string {
  // For now, just use PNG data URL
  // In the future, we could implement RLE compression for sparse masks
  return canvas.toDataURL("image/png");
}

/**
 * Decode base64 mask to ImageData
 */
export async function decodeMask(
  dataUrl: string,
  size: Size
): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.drawImage(img, 0, 0, size.width, size.height);
      resolve(ctx.getImageData(0, 0, size.width, size.height));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Convert mask ImageData to grayscale alpha channel
 * Returns Uint8Array where each value is the alpha (0-255)
 */
export function maskToAlpha(imageData: ImageData): Uint8Array {
  const alpha = new Uint8Array(imageData.width * imageData.height);

  for (let i = 0; i < alpha.length; i++) {
    // Use red channel as mask value (assuming grayscale mask)
    alpha[i] = imageData.data[i * 4];
  }

  return alpha;
}

/**
 * Apply mask to frame ImageData
 * Mask white (255) = fully visible, black (0) = fully transparent
 */
export function applyMaskToFrame(
  frame: ImageData,
  mask: ImageData
): ImageData {
  if (frame.width !== mask.width || frame.height !== mask.height) {
    console.warn("Mask size mismatch");
    return frame;
  }

  const result = new ImageData(
    new Uint8ClampedArray(frame.data),
    frame.width,
    frame.height
  );

  for (let i = 0; i < frame.width * frame.height; i++) {
    // Get mask value (red channel of grayscale)
    const maskValue = mask.data[i * 4];

    // Multiply frame alpha by mask value
    result.data[i * 4 + 3] = Math.round(
      (result.data[i * 4 + 3] * maskValue) / 255
    );
  }

  return result;
}

/**
 * Interpolate between two masks
 * @param maskA First mask ImageData
 * @param maskB Second mask ImageData
 * @param t Interpolation factor (0 = maskA, 1 = maskB)
 */
export function interpolateMasks(
  maskA: ImageData,
  maskB: ImageData,
  t: number
): ImageData {
  if (maskA.width !== maskB.width || maskA.height !== maskB.height) {
    console.warn("Cannot interpolate masks of different sizes");
    return maskA;
  }

  const result = new ImageData(maskA.width, maskA.height);
  const clampedT = Math.max(0, Math.min(1, t));

  for (let i = 0; i < result.data.length; i++) {
    result.data[i] = Math.round(
      maskA.data[i] * (1 - clampedT) + maskB.data[i] * clampedT
    );
  }

  return result;
}

/**
 * Apply easing function to interpolation factor
 */
export function applyEasing(
  t: number,
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out"
): number {
  switch (easing) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "linear":
    default:
      return t;
  }
}

/**
 * Create an empty mask (all white = fully visible)
 */
export function createEmptyMask(size: Size): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
  }

  return canvas;
}

/**
 * Create a fully transparent mask (all black)
 */
export function createTransparentMask(size: Size): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, size.width, size.height);
  }

  return canvas;
}
