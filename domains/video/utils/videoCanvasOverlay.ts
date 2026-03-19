import { Size } from "@/shared/types";

function getSafeCanvasSize(size: Size): Size {
  return {
    width: Math.max(1, Math.round(size.width || 1)),
    height: Math.max(1, Math.round(size.height || 1)),
  };
}

export function createBlankCanvasOverlayDataUrl(
  size: Size,
  fillColor: string | null = null
): string {
  if (typeof document === "undefined") {
    return "";
  }

  const safeSize = getSafeCanvasSize(size);
  const canvas = document.createElement("canvas");
  canvas.width = safeSize.width;
  canvas.height = safeSize.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("오버레이 캔버스를 만들 수 없습니다.");
  }

  context.clearRect(0, 0, safeSize.width, safeSize.height);

  if (fillColor) {
    context.fillStyle = fillColor;
    context.fillRect(0, 0, safeSize.width, safeSize.height);
  }

  return canvas.toDataURL("image/png");
}

export function loadImageElement(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("오버레이 이미지를 불러오지 못했습니다."));
    image.src = sourceUrl;
  });
}
