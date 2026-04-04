import { inpaintFrameWithMiGan } from "@/shared/ai/miganInpainting";

export interface WatermarkRemovalOptions {
  sourceCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  onProgress?: (progress: number, status: string) => void;
}

export async function removeWatermark(
  options: WatermarkRemovalOptions
): Promise<HTMLCanvasElement> {
  const { sourceCanvas, maskCanvas, onProgress } = options;
  const { width, height } = sourceCanvas;

  onProgress?.(5, "이미지 준비 중...");

  const sourceCtx = sourceCanvas.getContext("2d")!;
  const sourceImageData = sourceCtx.getImageData(0, 0, width, height);
  const rgba = new Uint8ClampedArray(sourceImageData.data);

  // Build hole mask from painted mask canvas (alpha > 0 = hole)
  const maskCtx = maskCanvas.getContext("2d")!;
  const maskImageData = maskCtx.getImageData(0, 0, width, height);
  const holeMask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    holeMask[i] = maskImageData.data[i * 4 + 3] > 0 ? 255 : 0;
  }

  onProgress?.(10, "AI 인페인팅 실행 중...");

  const resultRgba = await inpaintFrameWithMiGan({
    rgba,
    holeMask,
    width,
    height,
    onProgress,
  });

  // Composite: keep original pixels outside mask, use inpainted pixels inside mask
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = width;
  finalCanvas.height = height;
  const finalCtx = finalCanvas.getContext("2d")!;

  finalCtx.drawImage(sourceCanvas, 0, 0);
  const finalImageData = finalCtx.getImageData(0, 0, width, height);

  for (let i = 0; i < width * height; i++) {
    if (holeMask[i] > 0) {
      const offset = i * 4;
      finalImageData.data[offset] = resultRgba[offset];
      finalImageData.data[offset + 1] = resultRgba[offset + 1];
      finalImageData.data[offset + 2] = resultRgba[offset + 2];
      // Preserve original alpha
    }
  }

  finalCtx.putImageData(finalImageData, 0, 0);
  onProgress?.(100, "완료!");
  return finalCanvas;
}
