import { Point } from "../types";

// ============================================
// Checkerboard Pattern
// ============================================

export interface CheckerboardOptions {
  size?: number;
  lightColor?: string;
  darkColor?: string;
}

/**
 * 캔버스에 체커보드 배경 그리기
 */
export const drawCheckerboard = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: CheckerboardOptions = {},
): void => {
  const { size = 10, lightColor = "#1a1a1a", darkColor = "#252525" } = options;

  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const isLight = (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0;
      ctx.fillStyle = isLight ? lightColor : darkColor;
      ctx.fillRect(x, y, size, size);
    }
  }
};

// ============================================
// Polygon Drawing
// ============================================

export interface PolygonStyle {
  fillColor?: string;
  strokeColor?: string;
  lineWidth?: number;
}

/**
 * 폴리곤 그리기
 */
export const drawPolygon = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: PolygonStyle = {},
): void => {
  if (points.length < 2) return;

  const { fillColor = "rgba(0, 150, 255, 0.25)", strokeColor = "#00aaff", lineWidth = 2 } = style;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((p) => {
    ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();

  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
};

/**
 * 열린 폴리라인 그리기 (닫히지 않은)
 */
export const drawPolyline = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: PolygonStyle = {},
): void => {
  if (points.length < 2) return;

  const { strokeColor = "#00ff00", lineWidth = 2 } = style;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((p) => {
    ctx.lineTo(p.x, p.y);
  });

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
};

// ============================================
// Point Drawing
// ============================================

export interface PointStyle {
  radius?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

/**
 * 점 그리기
 */
export const drawPoint = (
  ctx: CanvasRenderingContext2D,
  point: Point,
  style: PointStyle = {},
): void => {
  const { radius = 5, fillColor = "#00ff00", strokeColor = "#fff", strokeWidth = 1 } = style;

  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();

  if (strokeWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
};

/**
 * 여러 점 그리기
 */
export const drawPoints = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: PointStyle = {},
  highlightIndex?: number,
  highlightColor?: string,
): void => {
  points.forEach((p, idx) => {
    const isHighlighted = idx === highlightIndex;
    drawPoint(ctx, p, {
      ...style,
      fillColor: isHighlighted ? highlightColor || "#ff0000" : style.fillColor,
    });
  });
};

// ============================================
// Label Drawing
// ============================================

export interface LabelStyle {
  backgroundColor?: string;
  textColor?: string;
  font?: string;
  radius?: number;
}

/**
 * 원형 라벨 그리기 (프레임 번호 등)
 */
export const drawCircleLabel = (
  ctx: CanvasRenderingContext2D,
  position: Point,
  text: string,
  style: LabelStyle = {},
): void => {
  const {
    backgroundColor = "#00aaff",
    textColor = "#fff",
    font = "bold 11px sans-serif",
    radius = 12,
  } = style;

  // 배경 원
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = backgroundColor;
  ctx.fill();

  // 텍스트
  ctx.fillStyle = textColor;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, position.x, position.y);
};

// ============================================
// Frame Color Utilities
// ============================================

/**
 * 프레임 인덱스에 따른 색상 생성
 */
export const getFrameColor = (index: number, saturation = 70, lightness = 50): string => {
  const hue = (index * 60) % 360;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

/**
 * 프레임 인덱스에 따른 반투명 색상 생성
 */
export const getFrameFillColor = (index: number, alpha = 0.15): string => {
  const hue = (index * 60) % 360;
  return `hsla(${hue}, 70%, 50%, ${alpha})`;
};

// ============================================
// Image Extraction
// ============================================

/**
 * 폴리곤 영역의 이미지 추출
 */
export const extractPolygonImage = (
  image: HTMLImageElement,
  points: Point[],
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
): string | undefined => {
  if (points.length < 3) return undefined;

  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const ctx = tempCanvas.getContext("2d");
  if (!ctx) return undefined;

  // 클리핑 패스 설정
  ctx.beginPath();
  ctx.moveTo(points[0].x - bbox.minX, points[0].y - bbox.minY);
  points.slice(1).forEach((p) => {
    ctx.lineTo(p.x - bbox.minX, p.y - bbox.minY);
  });
  ctx.closePath();
  ctx.clip();

  // 이미지 그리기
  ctx.drawImage(image, bbox.minX, bbox.minY, width, height, 0, 0, width, height);

  return tempCanvas.toDataURL("image/png");
};

// ============================================
// Canvas Size Utilities
// ============================================

/**
 * 이미지를 컨테이너에 맞추는 스케일 계산
 */
export const calculateFitScale = (
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 40,
): number => {
  const availableWidth = containerWidth - padding * 2;
  const availableHeight = containerHeight - padding * 2;
  return Math.min(availableWidth / imageWidth, availableHeight / imageHeight, 1);
};
