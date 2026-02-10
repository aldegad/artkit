import { SpriteFrame, SpriteTrack } from "../types";
import { compositeAllFrames } from "./compositor";

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
}

interface CompositedFramesZipOptions {
  frameSize?: SpriteExportFrameSize; // Per-frame output size override
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
  const link = document.createElement("a");
  link.download = `${projectName}-${validCount}f-spritesheet.${ext}`;
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
  const link = document.createElement("a");
  link.download = `${projectName}-${maxFrameCount}f-spritesheet.${ext}`;
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

  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = `${projectName}-${compositedFrames.length}f.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
