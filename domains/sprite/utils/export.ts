import { SpriteFrame, SpriteTrack } from "../types";
import { compositeAllFrames, compositeFrame, type CompositedFrame } from "./compositor";

// ============================================
// Single Frame Export
// ============================================

/**
 * Download a single frame as PNG
 */
export function downloadFrameAsPng(frame: SpriteFrame, filename: string): void {
  if (!frame.imageData) return;

  const link = document.createElement("a");
  link.download = `${filename}.png`;
  link.href = frame.imageData;
  link.click();
}

// ============================================
// Multiple Frames Export (ZIP)
// ============================================

/**
 * Download all frames as a ZIP file
 * Uses JSZip library dynamically loaded from CDN
 */
export async function downloadFramesAsZip(
  frames: SpriteFrame[],
  projectName: string,
): Promise<void> {
  const validFrames = frames.filter((f) => f.imageData && !f.disabled);
  if (validFrames.length === 0) return;

  // Dynamically import JSZip
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  validFrames.forEach((frame, index) => {
    if (!frame.imageData) return;

    // Remove data URL prefix to get raw base64
    const base64Data = frame.imageData.split(",")[1];
    const paddedIndex = String(index + 1).padStart(3, "0");
    zip.file(`${projectName}-${paddedIndex}.png`, base64Data, { base64: true });
  });

  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = `${projectName}-${validFrames.length}f.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// ============================================
// Sprite Sheet Export
// ============================================

export type SpriteSheetFormat = "png" | "webp";

export interface SpriteExportFrameSize {
  width: number;
  height: number;
}

interface SpriteSheetOptions {
  columns?: number; // Number of columns (auto-calculated if not provided)
  padding?: number; // Padding between frames
  backgroundColor?: string; // Background color (transparent by default)
  format?: SpriteSheetFormat; // Export format (default: png)
  quality?: number; // WebP quality 0-1 (default: 0.95)
  frameSize?: SpriteExportFrameSize; // Per-frame output size override
  appendFrameCount?: boolean; // Append frame count to file name (default: true)
}

interface CompositedFramesZipOptions {
  frameSize?: SpriteExportFrameSize; // Per-frame output size override
  appendFrameCount?: boolean; // Append frame count to file name (default: true)
}

function normalizeFrameSize(
  frameSize: SpriteExportFrameSize | undefined,
): SpriteExportFrameSize | null {
  if (!frameSize) return null;
  const width = Math.max(1, Math.floor(frameSize.width));
  const height = Math.max(1, Math.floor(frameSize.height));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

function resizeCanvas(
  source: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * Generate a sprite sheet from all frames
 */
export function generateSpriteSheet(
  frames: SpriteFrame[],
  options: SpriteSheetOptions = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    const validFrames = frames.filter((f) => f.imageData && !f.disabled);
    if (validFrames.length === 0) {
      resolve(null);
      return;
    }

    const { padding = 0, backgroundColor, format = "png", quality = 0.95 } = options;
    const frameSize = normalizeFrameSize(options.frameSize);

    // Load all images first
    const imagePromises = validFrames.map((frame) => {
      return new Promise<HTMLImageElement>((resolveImg) => {
        const img = new Image();
        img.onload = () => resolveImg(img);
        img.onerror = () => resolveImg(img);
        img.src = frame.imageData!;
      });
    });

    Promise.all(imagePromises).then((images) => {
      // Calculate frame dimensions
      let maxWidth = frameSize?.width ?? 0;
      let maxHeight = frameSize?.height ?? 0;
      if (!frameSize) {
        images.forEach((img) => {
          if (img.width > maxWidth) maxWidth = img.width;
          if (img.height > maxHeight) maxHeight = img.height;
        });
      }

      // Calculate grid dimensions
      const columns = options.columns || Math.ceil(Math.sqrt(validFrames.length));
      const rows = Math.ceil(validFrames.length / columns);

      // Create canvas
      const canvas = document.createElement("canvas");
      const cellWidth = maxWidth + padding * 2;
      const cellHeight = maxHeight + padding * 2;
      canvas.width = columns * cellWidth;
      canvas.height = rows * cellHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      // Fill background if specified
      if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Draw each frame
      images.forEach((img, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = col * cellWidth + padding;
        const y = row * cellHeight + padding;
        if (frameSize) {
          ctx.drawImage(img, x, y, frameSize.width, frameSize.height);
        } else {
          ctx.drawImage(
            img,
            x + (maxWidth - img.width) / 2,
            y + (maxHeight - img.height) / 2,
          );
        }
      });

      const mimeType = format === "webp" ? "image/webp" : "image/png";
      resolve(
        format === "webp"
          ? canvas.toDataURL(mimeType, quality)
          : canvas.toDataURL(mimeType),
      );
    });
  });
}

/**
 * Download sprite sheet as PNG or WebP
 */
export async function downloadSpriteSheet(
  frames: SpriteFrame[],
  projectName: string,
  options: SpriteSheetOptions = {},
): Promise<void> {
  const dataUrl = await generateSpriteSheet(frames, options);
  if (!dataUrl) return;

  const validCount = frames.filter((f) => f.imageData && !f.disabled).length;
  const ext = options.format === "webp" ? "webp" : "png";
  const appendFrameCount = options.appendFrameCount ?? true;
  const frameSuffix = appendFrameCount ? `-${validCount}f` : "";
  const link = document.createElement("a");
  link.download = `${projectName}${frameSuffix}-spritesheet.${ext}`;
  link.href = dataUrl;
  link.click();
}

// ============================================
// Project Metadata Export (JSON without images)
// ============================================

interface ProjectMetadata {
  name: string;
  fps: number;
  frameCount: number;
  frames: Array<{
    id: number;
    name: string;
    width: number;
    height: number;
    offset: { x: number; y: number };
  }>;
}

/**
 * Export project metadata as JSON (for game integration)
 */
export function exportProjectMetadata(
  frames: SpriteFrame[],
  projectName: string,
  fps: number,
): ProjectMetadata {
  const validFrames = frames.filter((f) => f.imageData && !f.disabled);

  return {
    name: projectName,
    fps,
    frameCount: validFrames.length,
    frames: validFrames.map((frame, index) => {
      // Calculate frame dimensions from imageData
      let width = 0;
      let height = 0;

      if (frame.imageData) {
        // Parse dimensions from base64 if needed
        // This is a rough estimate - actual dimensions come from the image
        const img = new Image();
        img.src = frame.imageData;
        width = img.width || 0;
        height = img.height || 0;
      }

      return {
        id: frame.id,
        name: frame.name || `frame-${index + 1}`,
        width,
        height,
        offset: frame.offset,
      };
    }),
  };
}

/**
 * Download project metadata as JSON
 */
export function downloadProjectMetadata(
  frames: SpriteFrame[],
  projectName: string,
  fps: number,
): void {
  const metadata = exportProjectMetadata(frames, projectName, fps);
  const json = JSON.stringify(metadata, null, 2);
  const blob = new Blob([json], { type: "application/json" });

  const link = document.createElement("a");
  link.download = `${projectName}-metadata.json`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// ============================================
// Full Project Export (with images as separate files)
// ============================================

export interface ExportedProject {
  metadata: ProjectMetadata;
  images: Record<string, string>; // filename -> base64
}

/**
 * Export full project as ZIP with images and metadata
 */
export async function downloadFullProject(
  frames: SpriteFrame[],
  projectName: string,
  fps: number,
): Promise<void> {
  const validFrames = frames.filter((f) => f.imageData && !f.disabled);
  if (validFrames.length === 0) return;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // Add frames folder
  const framesFolder = zip.folder("frames");

  // Add each frame
  validFrames.forEach((frame, index) => {
    if (!frame.imageData) return;
    const base64Data = frame.imageData.split(",")[1];
    const paddedIndex = String(index + 1).padStart(3, "0");
    framesFolder?.file(`${paddedIndex}.png`, base64Data, { base64: true });
  });

  // Add metadata
  const metadata = exportProjectMetadata(frames, projectName, fps);
  zip.file("metadata.json", JSON.stringify(metadata, null, 2));

  // Generate and download
  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = `${projectName}.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// ============================================
// Multi-track Composited Export
// ============================================

/**
 * Generate a sprite sheet from composited multi-track frames
 */
export async function generateCompositedSpriteSheet(
  tracks: SpriteTrack[],
  options: SpriteSheetOptions = {},
): Promise<string | null> {
  const compositedFrames = await compositeAllFrames(tracks);
  if (compositedFrames.length === 0) return null;

  const { padding = 0, backgroundColor, format = "png", quality = 0.95 } = options;
  const frameSize = normalizeFrameSize(options.frameSize);

  const maxWidth = frameSize?.width ?? Math.max(...compositedFrames.map((f) => f.width));
  const maxHeight = frameSize?.height ?? Math.max(...compositedFrames.map((f) => f.height));

  const columns = options.columns || Math.ceil(Math.sqrt(compositedFrames.length));
  const rows = Math.ceil(compositedFrames.length / columns);

  const cellWidth = maxWidth + padding * 2;
  const cellHeight = maxHeight + padding * 2;

  const canvas = document.createElement("canvas");
  canvas.width = columns * cellWidth;
  canvas.height = rows * cellHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  compositedFrames.forEach((frame, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * cellWidth + padding;
    const y = row * cellHeight + padding;

    if (frameSize) {
      ctx.drawImage(frame.canvas, x, y, frameSize.width, frameSize.height);
    } else {
      ctx.drawImage(
        frame.canvas,
        x + (maxWidth - frame.width) / 2,
        y + (maxHeight - frame.height) / 2,
      );
    }
  });

  const mimeType = format === "webp" ? "image/webp" : "image/png";
  return format === "webp"
    ? canvas.toDataURL(mimeType, quality)
    : canvas.toDataURL(mimeType);
}

/**
 * Download composited sprite sheet as PNG or WebP
 */
export async function downloadCompositedSpriteSheet(
  tracks: SpriteTrack[],
  projectName: string,
  options: SpriteSheetOptions = {},
): Promise<void> {
  const dataUrl = await generateCompositedSpriteSheet(tracks, options);
  if (!dataUrl) return;

  const maxFrameCount = Math.max(...tracks.filter((t) => t.visible).map((t) => t.frames.filter((f) => !f.disabled).length), 0);
  const ext = options.format === "webp" ? "webp" : "png";
  const appendFrameCount = options.appendFrameCount ?? true;
  const frameSuffix = appendFrameCount ? `-${maxFrameCount}f` : "";
  const link = document.createElement("a");
  link.download = `${projectName}${frameSuffix}-spritesheet.${ext}`;
  link.href = dataUrl;
  link.click();
}

/**
 * Download composited frames as ZIP
 */
export async function downloadCompositedFramesAsZip(
  tracks: SpriteTrack[],
  projectName: string,
  options: CompositedFramesZipOptions = {},
): Promise<void> {
  const compositedFrames = await compositeAllFrames(tracks);
  if (compositedFrames.length === 0) return;
  const frameSize = normalizeFrameSize(options.frameSize);

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  compositedFrames.forEach((cf, index) => {
    const sourceCanvas = frameSize
      ? resizeCanvas(cf.canvas, frameSize.width, frameSize.height)
      : cf.canvas;
    const base64Data = sourceCanvas.toDataURL("image/png").split(",")[1];
    const paddedIndex = String(index + 1).padStart(3, "0");
    zip.file(`${projectName}-${paddedIndex}.png`, base64Data, { base64: true });
  });

  const appendFrameCount = options.appendFrameCount ?? true;
  const frameSuffix = appendFrameCount ? `-${compositedFrames.length}f` : "";
  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = `${projectName}${frameSuffix}.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// ============================================
// Optimized Sprite Export (Static/Dynamic Split)
// ============================================

export type OptimizedTargetFramework = "canvas" | "phaser" | "pixi" | "custom";
const OPTIMIZED_THRESHOLD_MIN = 0;
const OPTIMIZED_THRESHOLD_MAX = 20;

export interface OptimizedExportOptions {
  threshold: number;
  target: OptimizedTargetFramework;
  includeGuide: boolean;
  fps: number;
  frameSize?: SpriteExportFrameSize;
}

export interface OptimizedExportProgress {
  stage: string;
  percent: number;
  detail?: string;
}

interface DynamicRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface OptimizedSpriteMetadata {
  meta: {
    format: "artkit-optimized-sprite";
    version: "1.0";
    fps: number;
    sourceSize: { w: number; h: number };
    frameCount: number;
    target: string;
  };
  base: {
    file: "base.png";
    size: { w: number; h: number };
  };
  delta: {
    file: "delta-spritesheet.png";
    frameSize: { w: number; h: number };
    columns: number;
    region: { x: number; y: number; w: number; h: number };
  } | null;
  frames: Array<{
    index: number;
    frame: { x: number; y: number; w: number; h: number };
  }>;
}

/**
 * Collect candidate timeline indices that are potentially renderable.
 * Uses the same disabled-frame filtering semantics as compositeAllFrames.
 */
function getCandidateFrameIndices(tracks: SpriteTrack[]): number[] {
  const maxFrames = Math.max(0, ...tracks.map((t) => t.frames.length));
  if (maxFrames === 0) return [];

  const visibleTracks = tracks.filter((t) => t.visible && t.frames.length > 0);
  const indices: number[] = [];

  for (let i = 0; i < maxFrames; i++) {
    const allDisabled = visibleTracks.every((t) => {
      const idx = i < t.frames.length ? i : t.loop ? i % t.frames.length : -1;
      return idx === -1 || t.frames[idx]?.disabled;
    });
    if (!allDisabled) {
      indices.push(i);
    }
  }

  return indices;
}

function clampOptimizedThreshold(value: number): number {
  if (!Number.isFinite(value)) return OPTIMIZED_THRESHOLD_MIN;
  return Math.max(
    OPTIMIZED_THRESHOLD_MIN,
    Math.min(OPTIMIZED_THRESHOLD_MAX, Math.floor(value)),
  );
}

async function resolveOptimizedOutputSize(
  tracks: SpriteTrack[],
  frameIndices: number[],
  frameSize: SpriteExportFrameSize | undefined,
  report: (stage: string, percent: number, detail?: string) => void,
): Promise<{ outputSize: SpriteExportFrameSize; frameIndices: number[] } | null> {
  const normalized = normalizeFrameSize(frameSize);
  if (normalized) {
    return { outputSize: normalized, frameIndices };
  }

  let maxWidth = 0;
  let maxHeight = 0;
  const renderableFrameIndices: number[] = [];
  const total = Math.max(1, frameIndices.length);

  for (let i = 0; i < frameIndices.length; i++) {
    const timelineFrameIndex = frameIndices[i];
    const composited = await compositeFrame(
      tracks,
      timelineFrameIndex,
      undefined,
      { includeDataUrl: false },
    );
    if (!composited) continue;
    renderableFrameIndices.push(timelineFrameIndex);
    if (composited.width > maxWidth) maxWidth = composited.width;
    if (composited.height > maxHeight) maxHeight = composited.height;

    if (i % 8 === 0 || i === frameIndices.length - 1) {
      const ratio = (i + 1) / total;
      report(
        "Resolving canvas size",
        5 + ratio * 10,
        `${i + 1}/${total}`,
      );
    }
  }

  if (renderableFrameIndices.length === 0 || maxWidth === 0 || maxHeight === 0) {
    return null;
  }

  return {
    outputSize: { width: maxWidth, height: maxHeight },
    frameIndices: renderableFrameIndices,
  };
}

async function analyzeStaticRegionsStreaming(
  tracks: SpriteTrack[],
  frameIndices: number[],
  outputSize: SpriteExportFrameSize,
  threshold: number,
  report: (stage: string, percent: number, detail?: string) => void,
): Promise<{
  staticMask: Uint8Array;
  width: number;
  height: number;
  referencePixels: Uint8ClampedArray;
  frameIndices: number[];
} | null> {
  const width = outputSize.width;
  const height = outputSize.height;
  const totalPixels = width * height;
  const staticMask = new Uint8Array(totalPixels);
  staticMask.fill(1);
  const resolvedFrameIndices: number[] = [];
  let referencePixels: Uint8ClampedArray | null = null;
  const total = Math.max(1, frameIndices.length);

  for (let i = 0; i < frameIndices.length; i++) {
    const timelineFrameIndex = frameIndices[i];
    const composited = await compositeFrame(
      tracks,
      timelineFrameIndex,
      outputSize,
      { includeDataUrl: false },
    );
    if (!composited) continue;

    const ctx = composited.canvas.getContext("2d");
    if (!ctx) continue;

    const pixels = ctx.getImageData(0, 0, width, height).data;
    resolvedFrameIndices.push(timelineFrameIndex);

    if (!referencePixels) {
      referencePixels = new Uint8ClampedArray(pixels);
    } else {
      for (let px = 0, idx = 0; px < totalPixels; px++, idx += 4) {
        if (staticMask[px] === 0) continue;
        const diff =
          Math.abs(pixels[idx] - referencePixels[idx]) +
          Math.abs(pixels[idx + 1] - referencePixels[idx + 1]) +
          Math.abs(pixels[idx + 2] - referencePixels[idx + 2]) +
          Math.abs(pixels[idx + 3] - referencePixels[idx + 3]);
        if (diff > threshold) {
          staticMask[px] = 0;
        }
      }
    }

    if (i % 4 === 0 || i === frameIndices.length - 1) {
      const ratio = (i + 1) / total;
      report(
        "Analyzing frames",
        20 + ratio * 35,
        `${i + 1}/${total}`,
      );
    }
  }

  if (!referencePixels || resolvedFrameIndices.length === 0) {
    return null;
  }

  return {
    staticMask,
    width,
    height,
    referencePixels,
    frameIndices: resolvedFrameIndices,
  };
}

/**
 * Find the bounding box of all dynamic (non-static) pixels.
 * Returns null if there are no dynamic pixels.
 */
function findDynamicBoundingBox(
  staticMask: Uint8Array,
  width: number,
  height: number,
): DynamicRegion | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (staticMask[y * width + x] === 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Generate base image: keep only static pixels, make dynamic pixels transparent.
 */
function generateBaseImage(
  referencePixels: Uint8ClampedArray,
  width: number,
  height: number,
  staticMask: Uint8Array,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let px = 0, idx = 0; px < staticMask.length; px++, idx += 4) {
    if (staticMask[px] === 0) continue;
    data[idx] = referencePixels[idx];
    data[idx + 1] = referencePixels[idx + 1];
    data[idx + 2] = referencePixels[idx + 2];
    data[idx + 3] = referencePixels[idx + 3];
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Generate a sprite sheet containing only the dynamic region from each frame.
 */
async function generateDeltaSpriteSheet(
  tracks: SpriteTrack[],
  frameIndices: number[],
  outputSize: SpriteExportFrameSize,
  region: DynamicRegion,
  report: (stage: string, percent: number, detail?: string) => void,
): Promise<{ canvas: HTMLCanvasElement; columns: number }> {
  const columns = Math.ceil(Math.sqrt(frameIndices.length));
  const rows = Math.ceil(frameIndices.length / columns);

  const canvas = document.createElement("canvas");
  canvas.width = columns * region.w;
  canvas.height = rows * region.h;
  const ctx = canvas.getContext("2d")!;
  const total = Math.max(1, frameIndices.length);

  for (let index = 0; index < frameIndices.length; index++) {
    const timelineFrameIndex = frameIndices[index];
    const frame = await compositeFrame(
      tracks,
      timelineFrameIndex,
      outputSize,
      { includeDataUrl: false },
    );
    if (!frame) continue;
    const col = index % columns;
    const row = Math.floor(index / columns);
    ctx.drawImage(
      frame.canvas,
      region.x,
      region.y,
      region.w,
      region.h,
      col * region.w,
      row * region.h,
      region.w,
      region.h,
    );

    if (index % 4 === 0 || index === frameIndices.length - 1) {
      const ratio = (index + 1) / total;
      report(
        "Generating images",
        60 + ratio * 15,
        `${index + 1}/${total}`,
      );
    }
  }

  return { canvas, columns };
}

/**
 * Generate a usage guide markdown for the optimized sprite sheet.
 */
function generateGuideMarkdown(
  metadata: OptimizedSpriteMetadata,
  target: OptimizedTargetFramework,
): string {
  const { meta, delta } = metadata;
  const src = meta.sourceSize;

  let codeExample = "";

  if (!delta) {
    codeExample = `// This sprite has no animation - all frames are identical.
// Simply draw base.png directly.
const img = new Image();
img.src = 'base.png';
img.onload = () => ctx.drawImage(img, 0, 0);`;
  } else if (target === "canvas") {
    codeExample = `const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const baseImg = new Image();
const deltaImg = new Image();

async function load() {
  const meta = await fetch('metadata.json').then(r => r.json());
  baseImg.src = 'base.png';
  deltaImg.src = 'delta-spritesheet.png';
  await Promise.all([
    new Promise(r => { baseImg.onload = r; }),
    new Promise(r => { deltaImg.onload = r; }),
  ]);
  return meta;
}

function startAnimation(meta) {
  const { region, frameSize, columns } = meta.delta;
  let frameIndex = 0;

  setInterval(() => {
    ctx.clearRect(0, 0, ${src.w}, ${src.h});
    // 1. Draw static background
    ctx.drawImage(baseImg, 0, 0);
    // 2. Draw delta frame at offset
    const col = frameIndex % columns;
    const row = Math.floor(frameIndex / columns);
    ctx.drawImage(
      deltaImg,
      col * frameSize.w, row * frameSize.h, frameSize.w, frameSize.h,
      region.x, region.y, region.w, region.h
    );
    frameIndex = (frameIndex + 1) % meta.meta.frameCount;
  }, 1000 / meta.meta.fps);
}

load().then(startAnimation);`;
  } else if (target === "phaser") {
    codeExample = `// Phaser 3 Example
class GameScene extends Phaser.Scene {
  preload() {
    this.load.json('spriteMeta', 'metadata.json');
    this.load.image('base', 'base.png');
  }

  create() {
    const meta = this.cache.json.get('spriteMeta');
    const { region, frameSize } = meta.delta;

    // Load delta as spritesheet with frame dimensions
    this.load.spritesheet('delta', 'delta-spritesheet.png', {
      frameWidth: frameSize.w,
      frameHeight: frameSize.h,
    });
    this.load.once('complete', () => {
      // Static background
      this.add.image(0, 0, 'base').setOrigin(0);

      // Animated delta sprite
      this.anims.create({
        key: 'play',
        frames: this.anims.generateFrameNumbers('delta', {
          start: 0,
          end: meta.meta.frameCount - 1,
        }),
        frameRate: meta.meta.fps,
        repeat: -1,
      });

      const sprite = this.add.sprite(region.x, region.y, 'delta').setOrigin(0);
      sprite.play('play');
    });
    this.load.start();
  }
}`;
  } else if (target === "pixi") {
    codeExample = `// PixiJS Example
import * as PIXI from 'pixi.js';

async function init() {
  const app = new PIXI.Application();
  await app.init({ width: ${src.w}, height: ${src.h} });
  document.body.appendChild(app.canvas);

  const meta = await fetch('metadata.json').then(r => r.json());
  const { region, frameSize, columns } = meta.delta;

  // Static background
  const baseTex = await PIXI.Assets.load('base.png');
  const base = new PIXI.Sprite(baseTex);
  app.stage.addChild(base);

  // Build delta frames
  const sheetTex = await PIXI.Assets.load('delta-spritesheet.png');
  const frames = [];
  for (let i = 0; i < meta.meta.frameCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const rect = new PIXI.Rectangle(
      col * frameSize.w, row * frameSize.h,
      frameSize.w, frameSize.h
    );
    frames.push(new PIXI.Texture({ source: sheetTex.source, frame: rect }));
  }

  const anim = new PIXI.AnimatedSprite(frames);
  anim.x = region.x;
  anim.y = region.y;
  anim.animationSpeed = meta.meta.fps / 60;
  anim.play();
  app.stage.addChild(anim);
}

init();`;
  } else {
    codeExample = `// Generic pseudocode
// 1. Load base.png as the static background layer
// 2. Load delta-spritesheet.png as the animation texture
// 3. Read metadata.json for frame layout info
//
// Each animation tick:
//   a) Draw base.png at (0, 0)
//   b) Calculate source rect from delta sheet:
//      srcX = (frameIndex % columns) * frameSize.w
//      srcY = Math.floor(frameIndex / columns) * frameSize.h
//   c) Draw delta region at (region.x, region.y) on canvas
//   d) Advance frameIndex: (frameIndex + 1) % frameCount`;
  }

  const deltaInfo = delta
    ? `- **delta-spritesheet.png**: Sprite sheet containing only the changing region (${delta.frameSize.w}x${delta.frameSize.h} per frame, ${delta.columns} columns)
- Delta region in source: x=${delta.region.x}, y=${delta.region.y}, ${delta.region.w}x${delta.region.h}`
    : `- No delta sprite sheet (all frames are identical)`;

  return `# Optimized Sprite Sheet Guide

## Files
- **base.png**: Static background — pixels that never change across frames (${src.w}x${src.h})
${deltaInfo}
- **metadata.json**: Frame offsets, sizes, and animation configuration

## How It Works
1. Draw \`base.png\` as the background layer (once, or each frame)
2. For each animation frame, draw the corresponding delta frame on top of the base at the specified offset position

## Animation Config
- **Frame count**: ${meta.frameCount}
- **FPS**: ${meta.fps}
- **Source size**: ${src.w} x ${src.h}
${delta ? `- **Delta region**: x=${delta.region.x}, y=${delta.region.y}, ${delta.region.w} x ${delta.region.h}\n- **Delta sprite columns**: ${delta.columns}` : "- No dynamic region detected"}

## Code Example (${target === "canvas" ? "Canvas API" : target === "phaser" ? "Phaser 3" : target === "pixi" ? "PixiJS" : "Generic"})

\`\`\`javascript
${codeExample}
\`\`\`

## Metadata Schema

\`\`\`json
{
  "meta": {
    "format": "artkit-optimized-sprite",
    "version": "1.0",
    "fps": <number>,
    "sourceSize": { "w": <number>, "h": <number> },
    "frameCount": <number>,
    "target": "<framework>"
  },
  "base": {
    "file": "base.png",
    "size": { "w": <number>, "h": <number> }
  },
  "delta": {
    "file": "delta-spritesheet.png",
    "frameSize": { "w": <number>, "h": <number> },
    "columns": <number>,
    "region": { "x": <number>, "y": <number>, "w": <number>, "h": <number> }
  } | null,
  "frames": [
    { "index": 0, "frame": { "x": 0, "y": 0, "w": <frameW>, "h": <frameH> } },
    ...
  ]
}
\`\`\`

---
*Generated by Artkit Sprite Editor*
`;
}

/**
 * Export optimized sprite sheet as ZIP: base.png + delta-spritesheet.png + metadata.json + GUIDE.md
 */
export async function downloadOptimizedSpriteZip(
  tracks: SpriteTrack[],
  projectName: string,
  options: OptimizedExportOptions,
  onProgress?: (progress: OptimizedExportProgress) => void,
): Promise<void> {
  const { target, includeGuide, fps, frameSize } = options;
  const threshold = clampOptimizedThreshold(options.threshold);

  const report = (stage: string, percent: number, detail?: string) => {
    onProgress?.({ stage, percent, detail });
  };

  const candidateFrameIndices = getCandidateFrameIndices(tracks);
  if (candidateFrameIndices.length === 0) return;

  report("Preparing frames", 5, `${candidateFrameIndices.length} candidates`);
  const resolved = await resolveOptimizedOutputSize(
    tracks,
    candidateFrameIndices,
    frameSize,
    report,
  );
  if (!resolved) return;

  const { outputSize } = resolved;
  const analyzed = await analyzeStaticRegionsStreaming(
    tracks,
    resolved.frameIndices,
    outputSize,
    threshold,
    report,
  );
  if (!analyzed) return;

  const { staticMask, referencePixels, frameIndices } = analyzed;
  const width = outputSize.width;
  const height = outputSize.height;

  // 1. Find dynamic bounding box
  report("Generating images", 55);
  const dynamicRegion = findDynamicBoundingBox(staticMask, width, height);

  // 2. Generate base image
  const baseCanvas = generateBaseImage(referencePixels, width, height, staticMask);
  report("Generating images", 60, "Base image ready");

  // 3. Generate delta sprite sheet (if there's a dynamic region)
  let deltaCanvas: HTMLCanvasElement | null = null;
  let deltaColumns = 0;
  if (dynamicRegion) {
    const result = await generateDeltaSpriteSheet(
      tracks,
      frameIndices,
      outputSize,
      dynamicRegion,
      report,
    );
    deltaCanvas = result.canvas;
    deltaColumns = result.columns;
    report("Generating images", 75, "Delta sprite sheet ready");
  }

  // 4. Build metadata
  report("Building metadata", 78);
  const metadata: OptimizedSpriteMetadata = {
    meta: {
      format: "artkit-optimized-sprite",
      version: "1.0",
      fps,
      sourceSize: { w: outputSize.width, h: outputSize.height },
      frameCount: frameIndices.length,
      target,
    },
    base: {
      file: "base.png",
      size: { w: outputSize.width, h: outputSize.height },
    },
    delta: dynamicRegion
      ? {
          file: "delta-spritesheet.png",
          frameSize: { w: dynamicRegion.w, h: dynamicRegion.h },
          columns: deltaColumns,
          region: {
            x: dynamicRegion.x,
            y: dynamicRegion.y,
            w: dynamicRegion.w,
            h: dynamicRegion.h,
          },
        }
      : null,
    frames: frameIndices.map((_, i) => ({
      index: i,
      frame: dynamicRegion
        ? {
            x: (i % deltaColumns) * dynamicRegion.w,
            y: Math.floor(i / deltaColumns) * dynamicRegion.h,
            w: dynamicRegion.w,
            h: dynamicRegion.h,
          }
        : { x: 0, y: 0, w: 0, h: 0 },
    })),
  };

  // 5. Build ZIP
  report("Packaging ZIP", 80);
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const basePng = baseCanvas.toDataURL("image/png").split(",")[1];
  zip.file("base.png", basePng, { base64: true });

  if (deltaCanvas) {
    const deltaPng = deltaCanvas.toDataURL("image/png").split(",")[1];
    zip.file("delta-spritesheet.png", deltaPng, { base64: true });
  }

  zip.file("metadata.json", JSON.stringify(metadata, null, 2));

  if (includeGuide) {
    const guide = generateGuideMarkdown(metadata, target);
    zip.file("GUIDE.md", guide);
  }

  report("Packaging ZIP", 90, "Compressing...");
  const blob = await zip.generateAsync({ type: "blob" });

  const link = document.createElement("a");
  link.download = `${projectName}-optimized.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);

  report("Done", 100);
}
