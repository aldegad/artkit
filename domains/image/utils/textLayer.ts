"use client";

import type { Point, TextLayerData, UnifiedLayer } from "@/shared/types";
import { clearLayerAlphaMask, drawIntoLayerAlphaMask } from "@/shared/utils/layerAlphaMask";

export const TEXT_LAYER_PADDING_X = 8;
export const TEXT_LAYER_PADDING_TOP = 10;
export const TEXT_LAYER_PADDING_BOTTOM = 6;

interface RenderTextLayerOptions {
  pixelScale?: number;
}

interface TextLayoutMetrics {
  lineHeight: number;
  lines: string[];
  startY: number;
  blockHeight: number;
  firstBaselineOffset: number;
}

interface TextLineMetrics {
  width: number;
  ascent: number;
  descent: number;
}

export function buildWrappedTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  letterSpacing = 0,
): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
    if (paragraph.length === 0) {
      lines.push("");
      return;
    }

    const words = paragraph.split(" ");
    let currentLine = words[0] || "";

    for (let i = 1; i < words.length; i += 1) {
      const nextLine = `${currentLine} ${words[i]}`;
      if (measureTextLine(ctx, nextLine, letterSpacing) <= maxWidth) {
        currentLine = nextLine;
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }

    lines.push(currentLine);
  });

  return lines;
}

export function getTextLayerFont(textData: TextLayerData): string {
  return `${textData.fontStyle} ${textData.fontWeight} ${textData.fontSize}px ${textData.fontFamily}`;
}

function getResolvedLineHeight(textData: TextLayerData): number {
  return Math.max(0.8, textData.lineHeight ?? 1.25);
}

function getResolvedLetterSpacing(textData: TextLayerData): number {
  return textData.letterSpacing ?? 0;
}

function getResolvedStrokeWidth(textData: TextLayerData): number {
  return Math.max(0, textData.strokeWidth ?? 0);
}

function getResolvedVerticalAlign(textData: TextLayerData): "top" | "middle" | "bottom" {
  return textData.verticalAlign ?? "top";
}

function measureTextLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number,
): number {
  if (!text) return 0;
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    width += ctx.measureText(text[i]).width;
    if (i < text.length - 1) width += letterSpacing;
  }
  return width;
}

function measureTextLineMetrics(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number,
): TextLineMetrics {
  const sampleText = text || "M";
  const metrics = ctx.measureText(sampleText);
  const ascent = Math.max(
    1,
    metrics.actualBoundingBoxAscent || metrics.fontBoundingBoxAscent || 0,
  );
  const descent = Math.max(
    0,
    metrics.actualBoundingBoxDescent || metrics.fontBoundingBoxDescent || 0,
  );

  return {
    width: measureTextLine(ctx, text, letterSpacing),
    ascent,
    descent,
  };
}

function drawTextLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baselineY: number,
  textData: TextLayerData,
): void {
  const letterSpacing = getResolvedLetterSpacing(textData);
  const lineWidth = measureTextLine(ctx, text, letterSpacing);
  const startX =
    textData.textAlign === "left" ? x :
      textData.textAlign === "center" ? x - lineWidth / 2 :
        x - lineWidth;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (letterSpacing === 0) {
    if (getResolvedStrokeWidth(textData) > 0) {
      ctx.strokeText(text, startX, baselineY);
    }
    ctx.fillText(text, startX, baselineY);
    ctx.restore();
    return;
  }

  let cursorX = startX;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (getResolvedStrokeWidth(textData) > 0) {
      ctx.strokeText(char, cursorX, baselineY);
    }
    ctx.fillText(char, cursorX, baselineY);
    cursorX += ctx.measureText(char).width + letterSpacing;
  }
  ctx.restore();
}

export function getTextLayoutMetrics(
  ctx: CanvasRenderingContext2D,
  textData: TextLayerData,
  options: RenderTextLayerOptions = {},
): TextLayoutMetrics {
  const pixelScale = Math.max(1, options.pixelScale ?? 1);
  const width = Math.max(1, Math.round(textData.width * pixelScale));
  const height = Math.max(1, Math.round(textData.height * pixelScale));
  const fontSize = Math.max(1, textData.fontSize * pixelScale);
  const paddingX = TEXT_LAYER_PADDING_X * pixelScale;
  const paddingTop = TEXT_LAYER_PADDING_TOP * pixelScale;
  const paddingBottom = TEXT_LAYER_PADDING_BOTTOM * pixelScale;
  const letterSpacing = getResolvedLetterSpacing(textData) * pixelScale;
  const strokeWidth = getResolvedStrokeWidth(textData) * pixelScale;
  const scaledTextData: TextLayerData = {
    ...textData,
    fontSize,
    letterSpacing,
    strokeWidth,
  };
  const lineHeight = Math.max(fontSize * getResolvedLineHeight(scaledTextData), fontSize + 2);
  const lines = buildWrappedTextLines(
    ctx,
    textData.text,
    Math.max(1, width - paddingX * 2),
    letterSpacing,
  );
  const lineMetrics = lines.map((line) => measureTextLineMetrics(ctx, line, letterSpacing));
  const firstLineMetrics = lineMetrics[0] ?? measureTextLineMetrics(ctx, "", letterSpacing);
  const lastLineMetrics = lineMetrics[lineMetrics.length - 1] ?? firstLineMetrics;
  const contentHeight = Math.max(0, height - paddingTop - paddingBottom);
  const blockHeight = Math.max(
    0,
    firstLineMetrics.ascent + lastLineMetrics.descent + Math.max(0, lines.length - 1) * lineHeight,
  );
  const extraSpace = Math.max(0, contentHeight - blockHeight);
  const startY =
    getResolvedVerticalAlign(textData) === "middle"
      ? paddingTop + extraSpace / 2
      : getResolvedVerticalAlign(textData) === "bottom"
        ? paddingTop + extraSpace
        : paddingTop;

  return {
    lineHeight,
    lines,
    startY,
    blockHeight,
    firstBaselineOffset: firstLineMetrics.ascent,
  };
}

export function renderTextLayerToCanvas(
  targetCanvas: HTMLCanvasElement,
  textData: TextLayerData,
  options: RenderTextLayerOptions = {},
): void {
  const pixelScale = Math.max(1, options.pixelScale ?? 1);
  const width = Math.max(1, Math.round(textData.width * pixelScale));
  const height = Math.max(1, Math.round(textData.height * pixelScale));
  const fontSize = Math.max(1, textData.fontSize * pixelScale);
  const paddingX = TEXT_LAYER_PADDING_X * pixelScale;
  const letterSpacing = getResolvedLetterSpacing(textData) * pixelScale;
  const strokeWidth = getResolvedStrokeWidth(textData) * pixelScale;

  targetCanvas.width = width;
  targetCanvas.height = height;

  const targetCtx = targetCanvas.getContext("2d");
  if (!targetCtx) return;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) return;

  tempCtx.clearRect(0, 0, width, height);
  if (textData.backgroundColor) {
    tempCtx.fillStyle = textData.backgroundColor;
    tempCtx.fillRect(0, 0, width, height);
  }
  tempCtx.fillStyle = textData.color;
  tempCtx.font = `${textData.fontStyle} ${textData.fontWeight} ${fontSize}px ${textData.fontFamily}`;
  tempCtx.textAlign = textData.textAlign;
  tempCtx.textBaseline = "alphabetic";
  tempCtx.lineJoin = "round";
  tempCtx.lineCap = "round";
  tempCtx.strokeStyle = textData.strokeColor || textData.color;
  tempCtx.lineWidth = strokeWidth;

  const scaledTextData: TextLayerData = {
    ...textData,
    fontSize,
    letterSpacing,
    strokeWidth,
  };

  const { lineHeight, lines, startY, firstBaselineOffset } = getTextLayoutMetrics(tempCtx, textData, { pixelScale });
  const alignX =
    textData.textAlign === "left" ? paddingX :
      textData.textAlign === "center" ? width / 2 :
        width - paddingX;

  lines.forEach((line, index) => {
    const baselineY = startY + firstBaselineOffset + index * lineHeight;
    drawTextLine(tempCtx, line, alignX, baselineY, scaledTextData);
  });

  targetCtx.clearRect(0, 0, width, height);
  targetCtx.drawImage(tempCanvas, 0, 0);
  clearLayerAlphaMask(targetCanvas);
  drawIntoLayerAlphaMask(targetCanvas, tempCanvas, 0, 0);
}

export function isPointInsideTextLayer(layer: UnifiedLayer, point: Point): boolean {
  if (!layer.textData || !layer.visible) return false;

  const posX = layer.position?.x ?? 0;
  const posY = layer.position?.y ?? 0;
  const width = Math.max(1, layer.textData.width);
  const height = Math.max(1, layer.textData.height);

  return (
    point.x >= posX &&
    point.x <= posX + width &&
    point.y >= posY &&
    point.y <= posY + height
  );
}

export function getTextLayerHitType(
  layer: UnifiedLayer,
  point: Point,
  layerCanvas?: HTMLCanvasElement | null,
): "content" | "bounds" | null {
  if (!isPointInsideTextLayer(layer, point)) return null;
  if (!layerCanvas) return "bounds";

  const localX = Math.floor(point.x - (layer.position?.x ?? 0));
  const localY = Math.floor(point.y - (layer.position?.y ?? 0));
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= layerCanvas.width ||
    localY >= layerCanvas.height
  ) {
    return "bounds";
  }

  const ctx = layerCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "bounds";

  const alpha = ctx.getImageData(localX, localY, 1, 1).data[3] ?? 0;
  return alpha > 16 ? "content" : "bounds";
}

export function getTextLayerName(text: string, index: number): string {
  const firstLine = text.split("\n")[0]?.trim() || "";
  if (!firstLine) return `Text ${index}`;
  return firstLine.length > 18 ? `${firstLine.slice(0, 18)}...` : firstLine;
}
